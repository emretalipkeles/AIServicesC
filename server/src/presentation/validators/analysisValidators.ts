import { z } from 'zod';

export const runAnalysisParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const runAnalysisBodySchema = z.object({
  extractFromDocuments: z.boolean().optional().default(true),
  matchToActivities: z.boolean().optional().default(true),
});

export const listDelayEventsParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

export const delayEventsChatBodySchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000, 'Message too long'),
  conversationHistory: z.array(chatMessageSchema).optional().default([]),
});
