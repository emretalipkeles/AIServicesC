import type { IPostParseDocumentHandler } from '../../../../domain/delay-analysis/interfaces/IPostParseDocumentHandler';
import type { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { ProcessDiaryDocumentCommand } from '../ProcessDiaryDocumentCommand';
import type { ProcessDiaryDocumentCommandHandler } from './ProcessDiaryDocumentCommandHandler';

/**
 * Thin adapter registering Foreman Diary's structured-extraction handler on the post-parse
 * seam (see IPostParseDocumentHandlerFactory), mirroring PodPostParseHandler so the upload
 * flow triggers it without an inline `documentType === 'daily_report'` check.
 */
export class DiaryPostParseHandler implements IPostParseDocumentHandler {
  constructor(private readonly processDiaryDocumentHandler: ProcessDiaryDocumentCommandHandler) {}

  canHandle(documentType: string): boolean {
    return documentType === 'daily_report';
  }

  async handle(document: ProjectDocument): Promise<void> {
    if (!document.rawContent) {
      return;
    }

    const command = new ProcessDiaryDocumentCommand(
      document.id,
      document.projectId,
      document.tenantId,
      document.rawContent,
      document.filename
    );

    await this.processDiaryDocumentHandler.execute(command);
  }
}
