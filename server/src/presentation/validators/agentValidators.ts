import { z } from 'zod';

export const createAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  systemPrompt: z.string().min(10, 'System prompt must be at least 10 characters'),
  model: z.string().default('claude-sonnet-4-5'),
  description: z.string().optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(2).optional(),
  systemPrompt: z.string().min(10).optional(),
  model: z.string().optional(),
  description: z.string().optional(),
});

export const uploadDocumentSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  contentType: z.string().min(1, 'Content type is required'),
  rawContent: z.string().min(1, 'Content is required'),
});

export const chatWithAgentSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).min(1, 'At least one message is required'),
  maxTokens: z.number().int().min(1).max(100000).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});
