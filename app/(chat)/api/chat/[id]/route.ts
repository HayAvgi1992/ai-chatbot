import { auth } from '@/app/(auth)/auth';
import { getChatById, getMessagesByChatId, saveMessages } from '@/lib/db/queries';
import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';

// Schema for message validation
const messageSchema = z.object({
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
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
  { params }: { params: { id: string } }
) {
  try {
    const { id: chatId } = params;
    
    console.log("POST request received for chat ID:", chatId);
    
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    // Check if the chat exists and belongs to the user
    const chat = await getChatById({ id: chatId });
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (chat.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse the request body
    let messageData;
    try {
      const body = await request.json();
      console.log("Received message data:", JSON.stringify(body));
      messageData = messageSchema.parse(body);
    } catch (error) {
      console.error("Invalid message data:", error);
      return NextResponse.json({ error: 'Invalid message data' }, { status: 400 });
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