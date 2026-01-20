import { randomUUID } from 'crypto';
import type { UploadDocumentsCommand } from '../UploadDocumentsCommand';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IDocumentParserFactory } from '../../../../domain/delay-analysis/interfaces/IDocumentParserFactory';
import { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';

export interface UploadDocumentsResult {
  uploaded: Array<{
    id: string;
    filename: string;
    status: string;
  }>;
  failed: Array<{
    filename: string;
    error: string;
  }>;
}

export class UploadDocumentsCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly parserFactory: IDocumentParserFactory
  ) {}

  async execute(command: UploadDocumentsCommand): Promise<UploadDocumentsResult> {
    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      throw new Error(`Project ${command.projectId} not found`);
    }

    const uploaded: UploadDocumentsResult['uploaded'] = [];
    const failed: UploadDocumentsResult['failed'] = [];
    const documentsToSave: ProjectDocument[] = [];
    const documentsWithBuffers: Array<{ document: ProjectDocument; buffer: Buffer }> = [];

    for (const file of command.files) {
      try {
        if (!this.parserFactory.isSupported(file.contentType)) {
          failed.push({
            filename: file.filename,
            error: `Unsupported file type: ${file.contentType}`,
          });
          continue;
        }

        const docId = randomUUID();
        const now = new Date();

        const document = new ProjectDocument({
          id: docId,
          projectId: command.projectId,
          tenantId: command.tenantId,
          filename: file.filename,
          contentType: file.contentType,
          documentType: file.documentType,
          rawContent: null,
          reportDate: null,
          status: 'pending',
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        });

        documentsToSave.push(document);
        documentsWithBuffers.push({ document, buffer: file.buffer });

        uploaded.push({
          id: docId,
          filename: file.filename,
          status: 'pending',
        });
      } catch (error) {
        failed.push({
          filename: file.filename,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (documentsToSave.length > 0) {
      await this.documentRepository.saveBatch(documentsToSave);
      
      for (const { document, buffer } of documentsWithBuffers) {
        this.parseDocumentAsync(document, buffer);
      }
    }

    return { uploaded, failed };
  }

  private async parseDocumentAsync(document: ProjectDocument, buffer: Buffer): Promise<void> {
    try {
      const parser = this.parserFactory.getParser(document.contentType);
      if (!parser) {
        await this.documentRepository.update(
          document.withProcessingStatus('failed', 'No parser available for content type')
        );
        return;
      }

      const processingDoc = document.withProcessingStatus('processing');
      await this.documentRepository.update(processingDoc);

      const result = await parser.parse(buffer, document.filename);

      const completedDoc = processingDoc
        .withRawContent(result.rawContent)
        .withProcessingStatus('completed');
      
      await this.documentRepository.update(completedDoc);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      await this.documentRepository.update(
        document.withProcessingStatus('failed', errorMessage)
      );
    }
  }
}
