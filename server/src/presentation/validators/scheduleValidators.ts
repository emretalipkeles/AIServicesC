import { z } from 'zod';

export const uploadScheduleParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const uploadScheduleBodySchema = z.object({
  targetMonth: z.coerce.number().min(1).max(12).optional(),
  targetYear: z.coerce.number().min(2000).max(2100).optional(),
});

export const listScheduleActivitiesParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const deleteScheduleActivityParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  activityId: z.string().uuid('Invalid activity ID'),
});
