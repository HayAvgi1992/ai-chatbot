import { auth } from '@/app/(auth)/auth';
import { getChatById, getMessagesByChatId, saveMessages ,
    saveChat,
  } from '@/lib/db/queries';
import { z } from 'zod';
import { generateTitleFromUserMessage } from '../../../../actions';
  
// Schema for POST request validation
const saveMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  parts: z.array(z.object({
    text: z.string(),
    type: z.enum(['text']),
  })),
  attachments: z.array(z.object({
    url: z.string().url(),
    name: z.string(),
    contentType: z.string(),
  })).optional().default([]),
  createdAt: z.coerce.date().optional(),
});

export async function GET(
  request: Request, 
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { id } = params;
    if (!id) {
      return new Response('Chat ID is required', { status: 400 });
    }

    // Check if the chat exists and belongs to the user
    const chat = await getChatById({ id });
    if (!chat) {
      return new Response('Chat not found', { status: 404 });
    }

    if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    // Get the messages for the chat
    const messages = await getMessagesByChatId({ id });

    return Response.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return new Response(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 500,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const chatId = params.id;
    
    const session = await auth();
    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (!chatId) {
      return new Response('Chat ID is required', { status: 400 });
    }

    // Parse the request body
    let messageData;
    try {
      const body = await request.json();
      console.log("Received message data:", JSON.stringify(body));
      messageData = saveMessageSchema.parse(body);
    } catch (error) {
      console.error("Invalid message data:", error);
      return new Response('Invalid message data', { status: 400 });
    }

    // Check if the chat exists and belongs to the user
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      // Create a new chat if it doesn't exist
      try {
        let title = "";
        try {
          // Use the parsed message data for title generation
          title = await generateTitleFromUserMessage({
            message: {
              id: messageData.id,
              role: messageData.role,
              content: messageData.content,
              parts: messageData.parts,
              experimental_attachments: messageData.attachments || [],
              createdAt: new Date(),
            },
          });
        } catch (titleError) {
          console.error("Failed to generate title:", titleError);
          title = "New Chat"; // Fallback title
        }

        console.log("Attempting to save chat with ID:", chatId, "and title:", title);
        await saveChat({ id: chatId, userId: session.user.id, title });
        console.log("Chat saved successfully");
      } catch (chatSaveError) {
        console.error("Failed to save chat:", chatSaveError);
        // Continue processing - the message might still be saved
      }
    } else if (chat.userId !== session.user.id) {
      return new Response('Forbidden', { status: 403 });
    }

    // Save the message to the database
    await saveMessages({
      messages: [
        {
          chatId,
          id: messageData.id,
          role: messageData.role,
          parts: messageData.parts,
          attachments: messageData.attachments || [],
          createdAt: messageData.createdAt || new Date(),
        },
      ],
    });

    // Return updated messages
    const updatedMessages = await getMessagesByChatId({ id: chatId });
    return Response.json(updatedMessages);
  } catch (error) {
    console.error('Error saving chat message:', error);
    return new Response(`An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      status: 500,
    });
  }
} 