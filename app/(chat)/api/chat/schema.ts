import { z } from 'zod';

const textPartSchema = z.object({
  text: z.string().min(1).max(10000),
  type: z.enum(['text']),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(['user']),
    content: z.string().min(1).max(10000),
    parts: z.array(textPartSchema),
    experimental_attachments: z
      .array(
        z.object({
          url: z.string().url(),
          name: z.string().min(1).max(2000),
          contentType: z.enum(['image/png', 'image/jpg', 'image/jpeg']),
        }),
      )
      .optional(),
  }),
  selectedChatModel: z.enum([
    'chat-model', 
    'chat-model-reasoning',
    // Claude models with accurate names
    'claude-3-haiku',
    'claude-3-sonnet',
    'claude-3-opus', 
    // With hyphens (how users might input them)
    'claude-3-5-sonnet',
    'claude-3-7-sonnet',
    // With periods (correct Anthropic format)
    'claude-3.5-sonnet',
    'claude-3.7-sonnet',
    // Explicit versioned models
    'claude-3-5-sonnet-20241022'
  ]),
  selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;