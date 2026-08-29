import { z } from 'zod';

export const measuredMileProjectParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
});

export const measuredMileItemParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  itemNo: z.coerce.number().int().positive(),
});

export const measuredMileItemPeriodParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  itemNo: z.coerce.number().int().positive(),
  peNumber: z.coerce.number().int().positive(),
});

export const measuredMilePeriodParamsSchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  peNumber: z.coerce.number().int().positive(),
});

export const measuredMileSeriesQuerySchema = z.object({
  verifiedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  wbsCodes: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
  shiftHours: z.coerce.number().positive().max(24).optional().default(8),
});

export const measuredMilePeriodDetailQuerySchema = z.object({
  verifiedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  wbsCodes: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined)),
});

export const setAccelerationTagBodySchema = z.object({
  createdBy: z.string().max(200).optional(),
});

export const setMeasuredMileOverrideBodySchema = z.object({
  startPeNumber: z.coerce.number().int().positive(),
  endPeNumber: z.coerce.number().int().positive(),
  createdBy: z.string().max(200).optional(),
});
