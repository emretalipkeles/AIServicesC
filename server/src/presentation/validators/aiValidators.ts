import { z } from 'zod';
import { SUPPORTED_MODELS } from '../../domain/value-objects/ModelId';

const modelNames = Object.keys(SUPPORTED_MODELS) as [string, ...string[]];

export const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty'),
});

export const chatRequestSchema = z.object({
  model: z.enum(modelNames),
  messages: z.array(messageSchema).min(1, 'At least one message is required'),
  maxTokens: z.number().int().positive().max(100000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
});

export const testConnectionRequestSchema = z.object({
  model: z.enum(modelNames).optional(),
}).optional();

export type ValidatedChatRequest = z.infer<typeof chatRequestSchema>;
export type ValidatedTestConnectionRequest = z.infer<typeof testConnectionRequestSchema>;
