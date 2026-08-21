import type { IPostParseDocumentHandler } from '../../../../domain/delay-analysis/interfaces/IPostParseDocumentHandler';
import type { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { ProcessPodDocumentCommand } from '../ProcessPodDocumentCommand';
import type { ProcessPodDocumentCommandHandler } from './ProcessPodDocumentCommandHandler';

/**
 * Thin adapter registering POD's structured-extraction handler on the post-parse seam
 * (see IPostParseDocumentHandlerFactory), so the upload flow triggers it without an
 * inline `documentType === 'pod'` check.
 */
export class PodPostParseHandler implements IPostParseDocumentHandler {
  constructor(private readonly processPodDocumentHandler: ProcessPodDocumentCommandHandler) {}

  canHandle(documentType: string): boolean {
    return documentType === 'pod';
  }

  async handle(document: ProjectDocument): Promise<void> {
    if (!document.rawContent) {
      return;
    }

    const command = new ProcessPodDocumentCommand(
      document.id,
      document.projectId,
      document.tenantId,
      document.rawContent,
      document.filename,
      document.reportDate
    );

    await this.processPodDocumentHandler.execute(command);
  }
}
