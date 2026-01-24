import { z } from 'zod';

export const orchestrationContextSchema = z.object({
  activeDelayAnalysisProjectId: z.string().uuid().optional(),
}).optional();

export const orchestrateRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  conversationId: z.string().uuid().nullish(),
  context: orchestrationContextSchema,
});

export type OrchestrateRequest = z.infer<typeof orchestrateRequestSchema>;
