import { z } from 'zod';

export const uploadResultRequestSchema = z.object({
  conversationId: z.string().uuid().nullish(),
  packageId: z.string().min(1, 'Package ID is required'),
  packageName: z.string().min(1, 'Package name is required'),
  s3Path: z.string().nullish(),
  success: z.boolean(),
  error: z.string().nullish(),
});

export type UploadResultRequest = z.infer<typeof uploadResultRequestSchema>;
