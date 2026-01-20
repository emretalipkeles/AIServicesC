import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

export interface UploadedFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
  documentType: ProjectDocumentType;
}

export class UploadDocumentsCommand {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly files: UploadedFile[]
  ) {}
}
