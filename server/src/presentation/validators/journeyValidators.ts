import { z } from 'zod';

export const updateJourneyProgressSchema = z.object({
  progress: z.number().min(0).max(100, 'Progress must be between 0 and 100'),
  status: z.enum(['pending', 'in_progress', 'completed', 'paused']).optional(),
});

export type UpdateJourneyProgressRequest = z.infer<typeof updateJourneyProgressSchema>;
