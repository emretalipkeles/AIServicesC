import { z } from 'zod';

export const orchestrateRequestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  conversationId: z.string().uuid().nullish(),
});

export type OrchestrateRequest = z.infer<typeof orchestrateRequestSchema>;
