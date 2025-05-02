import { auth } from '@/app/(auth)/auth';
import { getChatById, getMessagesByChatId, saveMessages, saveChat } from '@/lib/db/queries';
import { z } from 'zod';
import { generateTitleFromUserMessage } from '../../../../actions';
import { NextRequest, NextResponse } from 'next/server';

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
  request: NextRequest,
) {
  try {
    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    // Check if the chat exists and belongs to the user
    const chat = await getChatById({ id });
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chat.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the messages for the chat
    const messages = await getMessagesByChatId({ id });

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    return NextResponse.json(
      { error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` }, 
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const { searchParams } = request.nextUrl;
    const chatId = searchParams.get('id');
    
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    // Parse the request body
    let messageData;
    try {
      const body = await request.json();
      console.log("Received message data:", JSON.stringify(body));
      messageData = saveMessageSchema.parse(body);
    } catch (error) {
      console.error("Invalid message data:", error);
      return NextResponse.json({ error: 'Invalid message data' }, { status: 400 });
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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    return NextResponse.json(updatedMessages);
  } catch (error) {
    console.error('Error saving chat message:', error);
    return NextResponse.json(
      { error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` }, 
      { status: 500 }
    );
  }
} 
