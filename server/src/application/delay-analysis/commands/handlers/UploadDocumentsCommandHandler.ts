import { randomUUID } from 'crypto';
import type { UploadDocumentsCommand } from '../UploadDocumentsCommand';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IDocumentParserFactory } from '../../../../domain/delay-analysis/interfaces/IDocumentParserFactory';
import type { IDocumentHashService } from '../../../../domain/delay-analysis/interfaces/IDocumentHashService';
import type { IPostParseDocumentHandlerFactory } from '../../../../domain/delay-analysis/interfaces/IPostParseDocumentHandlerFactory';
import { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { extractDocumentDate } from '../../../../infrastructure/delay-analysis/DocumentDateExtractor';
import { ConcurrencyLimiter } from '../../../../infrastructure/concurrency/ConcurrencyLimiter';

// Bounds how many documents parse/extract concurrently per batch. Uploading hundreds of
// files at once previously fired an AI call per document with no limit, tripping provider
// rate limits and silently failing most extractions (see PodPostParseHandler).
const DOCUMENT_PROCESSING_CONCURRENCY = 5;

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
  skipped: Array<{
    filename: string;
    reason: string;
    existingDocumentId: string;
  }>;
}

export class UploadDocumentsCommandHandler {
  private readonly processingLimiter = new ConcurrencyLimiter(DOCUMENT_PROCESSING_CONCURRENCY);

  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly parserFactory: IDocumentParserFactory,
    private readonly hashService: IDocumentHashService,
    private readonly postParseHandlerFactory?: IPostParseDocumentHandlerFactory
  ) {}

  async execute(command: UploadDocumentsCommand): Promise<UploadDocumentsResult> {
    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      throw new Error(`Project ${command.projectId} not found`);
    }

    const uploaded: UploadDocumentsResult['uploaded'] = [];
    const failed: UploadDocumentsResult['failed'] = [];
    const skipped: UploadDocumentsResult['skipped'] = [];
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

        const contentHash = this.hashService.computeHash(file.buffer);

        const existingDocument = await this.documentRepository.findByContentHash(
          command.projectId,
          command.tenantId,
          contentHash
        );

        if (existingDocument) {
          skipped.push({
            filename: file.filename,
            reason: 'This document was already uploaded',
            existingDocumentId: existingDocument.id,
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
          contentHash,
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

      // Persist the raw bytes before kicking off async processing so a mid-flight server
      // restart leaves enough state behind for StartupReconciliationService to retry the
      // document itself instead of just marking it failed.
      for (const { document, buffer } of documentsWithBuffers) {
        await this.documentRepository.setFileData(document.id, document.tenantId, buffer);
      }

      for (const { document, buffer } of documentsWithBuffers) {
        this.processingLimiter.run(() => this.parseDocumentAsync(document, buffer));
      }
    }

    return { uploaded, failed, skipped };
  }

  /**
   * Re-runs processing for a document left in 'pending'/'processing' by an interrupted server
   * process, using the raw bytes persisted at upload time. Used by StartupReconciliationService;
   * not part of the normal upload path. Routed through the same processingLimiter as a normal
   * upload batch - without this, reconciling a large stuck batch (e.g. 916 documents) would
   * fire every retry's parse/AI-extraction call at once, recreating the exact rate-limit
   * overload this limiter exists to prevent.
   */
  reprocessDocument(document: ProjectDocument, buffer: Buffer): Promise<void> {
    return this.processingLimiter.run(() => this.parseDocumentAsync(document, buffer));
  }

  private async parseDocumentAsync(document: ProjectDocument, buffer: Buffer): Promise<void> {
    try {
      const parser = this.parserFactory.getParser(document.contentType, document.documentType);
      if (!parser) {
        // update() clears retained file bytes atomically with the terminal status write - see
        // DrizzleProjectDocumentRepository.update.
        await this.documentRepository.update(
          document.withProcessingStatus('failed', 'No parser available for content type')
        );
        return;
      }

      const processingDoc = document.withProcessingStatus('processing');
      await this.documentRepository.update(processingDoc);

      const result = await parser.parse(buffer, document.filename);

      const dateExtraction = extractDocumentDate(
        result.rawContent,
        document.documentType,
        document.filename
      );

      if (dateExtraction.date) {
        console.log(`[DocumentUpload] Extracted date from ${document.filename}: ${dateExtraction.date.toISOString().split('T')[0]} (source: ${dateExtraction.source})`);
      }

      const completedDoc = processingDoc
        .withRawContent(result.rawContent)
        .withReportDate(dateExtraction.date)
        .withProcessingStatus('completed');
      
      // update() clears retained file bytes atomically with the terminal status write - see
      // DrizzleProjectDocumentRepository.update. Raw bytes are only needed to survive a restart
      // while processing is in flight; once parsing succeeds, `rawContent` is the durable artifact.
      await this.documentRepository.update(completedDoc);

      // Document-type-specific structured extraction (e.g. POD), resolved through the same
      // factory-style seam as the parser rather than an inline type check. A failure here must
      // never disturb the raw-content save above or the document's completed status.
      const postParseHandler = this.postParseHandlerFactory?.getHandler(completedDoc.documentType);
      if (postParseHandler) {
        try {
          await postParseHandler.handle(completedDoc);
        } catch (postParseError) {
          console.error(`[DocumentUpload] Structured extraction failed for ${completedDoc.filename}:`, postParseError);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      // update() clears retained file bytes atomically with the terminal status write - see
      // DrizzleProjectDocumentRepository.update.
      await this.documentRepository.update(
        document.withProcessingStatus('failed', errorMessage)
      );
    }
  }
}
