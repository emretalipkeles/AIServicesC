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
