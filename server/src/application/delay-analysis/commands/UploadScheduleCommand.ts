export interface UploadScheduleCommand {
  projectId: string;
  tenantId: string;
  file: {
    filename: string;
    contentType: string;
    buffer: Buffer;
  };
  targetMonth?: number;
  targetYear?: number;
}
