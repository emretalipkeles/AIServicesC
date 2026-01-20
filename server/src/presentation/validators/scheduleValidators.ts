import { z } from 'zod';

export const uploadScheduleParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const uploadScheduleBodySchema = z.object({
  scheduleUpdateMonth: z.string().optional(),
});

export const listScheduleActivitiesParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const deleteScheduleActivityParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  activityId: z.string().uuid('Invalid activity ID'),
});
