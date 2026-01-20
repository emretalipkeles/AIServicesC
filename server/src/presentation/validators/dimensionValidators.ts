import { z } from 'zod';

export const dimensionKindSchema = z.enum(['OtherDimension', 'AccountDimension', 'TimeDimension']);

export const createOtherDimensionRequestSchema = z.object({
  modelName: z.string().min(1, 'Model name is required'),
  dimensionName: z.string()
    .min(1, 'Dimension name is required')
    .max(100, 'Dimension name must be 100 characters or less')
    .regex(
      /^[^/\\*|?"()\[\]{}<>=+!$%&':;,`.@]*$/,
      'Dimension name contains invalid characters'
    ),
  dimensionKind: dimensionKindSchema.default('OtherDimension'),
  dimensionDescription: z.string().max(500).optional(),
});

export type CreateOtherDimensionRequest = z.infer<typeof createOtherDimensionRequestSchema>;
