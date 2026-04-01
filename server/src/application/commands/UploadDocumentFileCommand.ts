import { BaseCommand } from '../interfaces/ICommandBus';
import type { ExtractionProgressCallback } from '../services/IDocumentExtractionService';

export class UploadDocumentFileCommand extends BaseCommand {
  readonly type = 'UploadDocumentFileCommand' as const;
  constructor(
    public readonly agentId: string,
    tenantId: string,
    public readonly filename: string,
    public readonly mimeType: string,
    public readonly buffer: Buffer,
    public readonly onProgress?: ExtractionProgressCallback
  ) {
    super(tenantId);
  }
}
