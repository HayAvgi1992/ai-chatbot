import {
  appendClientMessage,
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type CoreMessage
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';

// Helper function to convert database messages to CoreMessage format
function convertToCoreMessages(messages: any[]): CoreMessage[] {
  // Define an interface for the message parts
  interface MessagePart {
    type: string;
    text?: string;
  }

  return messages.map(message => {
    // For messages with parts, convert them to content
    if (message.parts && Array.isArray(message.parts)) {
      return {
        role: message.role,
        content: message.parts.map((part: MessagePart) => 
          part.type === 'text' ? part.text || '' : ''
        ).join(' ').trim()
      };
    }
    
    // For messages already having content
    if (message.content) {
      return {
        role: message.role,
        content: message.content
      };
    }
    
    // Fallback case
    return {
      role: message.role,
      content: ''
    };
  });
}

export const maxDuration = 60;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new Response('Invalid request body', { status: 400 });
  }

  try {
    const { id, message, selectedChatModel, saveUserMessage = true, addMessageToModel = true } = requestBody;
    const session = await auth();
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new Response(
        'You have exceeded your maximum number of messages for the day! Please try again later.',
        {
          status: 429,
        },
      );
    }

    const chat = await getChatById({ id });

    if (!chat) {
      try {
        let title = "";
        try {
          title = await generateTitleFromUserMessage({
            message,
          });
        } catch (titleError) {
          console.error("Failed to generate title:", titleError);
          title = "Web Search Results"; // Fallback title
        }

        console.log("Attempting to save chat with ID:", id, "and title:", title);
        await saveChat({ id, userId: session.user.id, title });
        console.log("Chat saved successfully");
      } catch (chatSaveError) {
        console.error("Failed to save chat:", chatSaveError);
        // Continue processing - the message might still be saved
      }
    } else {
      if (chat.userId !== session.user.id) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const previousMessages = await getMessagesByChatId({ id });

    // Determine the messages to send to the model based on addMessageToModel flag
    let messagesForModel;
    if (addMessageToModel) {
      // Include the current user message in context
      messagesForModel = appendClientMessage({
        // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
        messages: previousMessages,
        message,
      });
    } else {
      // Only use previous messages without adding the current one
      // Make sure we have at least one message to prevent errors
      messagesForModel = previousMessages.length > 0 
        ? previousMessages 
        : [{ role: 'system', content: 'You are a helpful assistant.' }];
    }

    // Convert to CoreMessage format for streamText
    const coreMessages = convertToCoreMessages(messagesForModel);

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Only save the user message if saveUserMessage is true
    if (saveUserMessage) {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: 'user',
            parts: message.parts,
            attachments: message.experimental_attachments ?? [],
            createdAt: new Date(),
          },
        ],
      });
    }

    return createDataStreamResponse({
      execute: (dataStream) => {
        try {
          
          const result = streamText({
            model: myProvider.languageModel(selectedChatModel),
            system: systemPrompt({ 
              selectedChatModel, 
              requestHints,
              messages: messagesForModel 
            }),
            messages: coreMessages,
            maxSteps: 5,
            experimental_activeTools:
              selectedChatModel === 'chat-model-reasoning' || 
              message.content.toLowerCase().includes('web search results') ||
              message.content.includes('<search_results>') ||
              !addMessageToModel // Disable tools when we're not adding message to model
                ? []
                : [
                    // Disable all automatic tools for web search responses
                    'getWeather',
                    // 'createDocument', // Temporarily disabled document creation
                    'updateDocument',
                    'requestSuggestions',
                  ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            experimental_generateMessageId: generateUUID,
            tools: {
              getWeather,
              // createDocument: createDocument({ session, dataStream }), // Temporarily disabled document creation
              updateDocument: updateDocument({ session, dataStream }),
              requestSuggestions: requestSuggestions({
                session,
                dataStream,
              }),
            },
            onFinish: async ({ response }) => {
              if (session.user?.id) {
                try {
                  //console.log("onFinish Response: ", response.messages);
                  const assistantId = getTrailingMessageId({
                    messages: response.messages.filter(
                      (message) => message.role === 'assistant',
                    ),
                  });

                  if (!assistantId) {
                    throw new Error('No assistant message found!');
                  }

                  const [, assistantMessage] = appendResponseMessages({
                    messages: [message],
                    responseMessages: response.messages,
                  });

                  console.log("onFinish Assistant Message: ", assistantMessage.role);
                  
                  // Skip saving if this is a web search response (handled separately by web search component)
                  const isWebSearchResponse = 
                    message.content.includes('<search_results>') || 
                    message.content.toLowerCase().includes('web search results');
                    
                  if (!isWebSearchResponse) {
                    await saveMessages({
                      messages: [
                        {
                          id: assistantId,
                          chatId: id,
                          role: assistantMessage.role,
                          parts: assistantMessage.parts,
                          attachments:
                            assistantMessage.experimental_attachments ?? [],
                          createdAt: new Date(),
                        },
                      ],
                    });
                  } else {
                    console.log("Skipping save for web search response - already handled by web search component");
                  }
                } catch (error) {
                  console.error('Failed to save chat message:', error);
                }
              }
            },
            experimental_telemetry: {
              isEnabled: isProductionEnvironment,
              functionId: 'stream-text',
            },
          });

          console.log("streamText result created, consuming stream");
          result.consumeStream();

          console.log("Merging into data stream");
          result.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          });
        } catch (streamError) {
          console.error("Error during streamText execution:", streamError);
          throw streamError;
        }
      },
      onError: (error) => {
        console.error("createDataStreamResponse error:", error);
        return 'Oops, an error occurred! Please check the server logs for details.';
      },
    });
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(`An error occurred while processing your request! ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    const deletedChat = await deleteChatById({ id });

    return Response.json(deletedChat, { status: 200 });
  } catch (error) {
    console.error('Error in chat API:', error);
    return new Response(`An error occurred while processing your request! ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 500,
    });
  }
}

