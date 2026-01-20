import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { UploadDocumentFileCommand } from '../UploadDocumentFileCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import type { IChunkRepository } from '../../../domain/repositories/IChunkRepository';
import type { IDocumentProcessor } from '../../services/IDocumentProcessor';
import type { IDocumentExtractionService } from '../../services/IDocumentExtractionService';
import type { IDocumentUnderstandingService } from '../../services/IDocumentUnderstandingService';
import type { IProcessingSessionRepository } from '../../../domain/repositories/IProcessingSessionRepository';
import type { AgentDocumentDto } from '../../dto/AgentDto';
import { Document } from '../../../domain/entities/Document';
import { Chunk } from '../../../domain/entities/Chunk';
import { ProcessingSession } from '../../../domain/entities/ProcessingSession';
import { randomUUID } from 'crypto';

export interface UploadDocumentFileResult {
  documents: AgentDocumentDto[];
  errors: Array<{ filename: string; error: string }>;
  skipped: Array<{ filename: string; reason: string }>;
}

export class UploadDocumentFileCommandHandler 
  implements ICommandHandler<UploadDocumentFileCommand, UploadDocumentFileResult> {
  
  private readonly AI_UNDERSTANDING_THRESHOLD = 1000;
  
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly chunkRepository: IChunkRepository,
    private readonly documentProcessor: IDocumentProcessor,
    private readonly extractionService: IDocumentExtractionService,
    private readonly understandingService: IDocumentUnderstandingService | null = null,
    private readonly sessionRepository: IProcessingSessionRepository | null = null
  ) {}

  async handle(command: UploadDocumentFileCommand): Promise<UploadDocumentFileResult> {
    const tenantId = command.tenantId ?? 'default';

    const agent = await this.agentRepository.findById(command.agentId, tenantId);
    if (!agent) {
      throw new Error(`Agent not found: ${command.agentId}`);
    }

    const extractionResult = await this.extractionService.extractFromBuffer(
      command.buffer,
      command.filename,
      command.mimeType,
      command.onProgress
    );

    const documents: AgentDocumentDto[] = [];
    const errors = [...extractionResult.errors];
    const skipped = [...extractionResult.skipped];

    for (const extractedDoc of extractionResult.documents) {
      try {
        const docResult = await this.processExtractedDocument(
          extractedDoc,
          command.agentId,
          tenantId
        );
        documents.push(docResult);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ filename: extractedDoc.filename, error: errorMessage });
      }
    }

    return { documents, errors, skipped };
  }

  private async processExtractedDocument(
    extractedDoc: { filename: string; content: string; originalMimeType: string; extractionMethod: string },
    agentId: string,
    tenantId: string
  ): Promise<AgentDocumentDto> {
    const now = new Date();
    const document = new Document({
      id: randomUUID(),
      agentId,
      tenantId,
      filename: extractedDoc.filename,
      contentType: extractedDoc.originalMimeType,
      rawContent: extractedDoc.content,
      status: 'processing',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.documentRepository.save(document);

    const useAIUnderstanding = 
      this.understandingService && 
      this.sessionRepository && 
      extractedDoc.content.length > this.AI_UNDERSTANDING_THRESHOLD;

    if (useAIUnderstanding) {
      this.processInBackground(document, extractedDoc.content, agentId, tenantId, now);
      
      return {
        id: document.id,
        agentId: document.agentId,
        tenantId: document.tenantId,
        filename: document.filename,
        contentType: document.contentType,
        status: 'processing',
        errorMessage: null,
        createdAt: document.createdAt,
        updatedAt: now,
      };
    }

    try {
      const chunks = await this.processWithSimpleChunking(
        document,
        extractedDoc.content,
        agentId,
        tenantId,
        now
      );

      if (chunks.length > 0) {
        await this.chunkRepository.saveBatch(chunks);
      }

      await this.documentRepository.updateStatus(document.id, tenantId, 'indexed');

      return {
        id: document.id,
        agentId: document.agentId,
        tenantId: document.tenantId,
        filename: document.filename,
        contentType: document.contentType,
        status: 'indexed',
        errorMessage: null,
        createdAt: document.createdAt,
        updatedAt: new Date(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.documentRepository.updateStatus(document.id, tenantId, 'failed', errorMessage);

      return {
        id: document.id,
        agentId: document.agentId,
        tenantId: document.tenantId,
        filename: document.filename,
        contentType: document.contentType,
        status: 'failed',
        errorMessage,
        createdAt: document.createdAt,
        updatedAt: new Date(),
      };
    }
  }

  private processInBackground(
    document: Document,
    content: string,
    agentId: string,
    tenantId: string,
    now: Date
  ): void {
    setImmediate(async () => {
      console.log(`[BackgroundProcessing] Starting AI understanding for document ${document.id}`);
      try {
        const chunks = await this.processWithAIUnderstanding(
          document,
          content,
          agentId,
          tenantId,
          now
        );

        if (chunks.length > 0) {
          await this.chunkRepository.saveBatch(chunks);
        }

        await this.documentRepository.updateStatus(document.id, tenantId, 'indexed');
        console.log(`[BackgroundProcessing] Document ${document.id} indexed successfully with ${chunks.length} chunks`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[BackgroundProcessing] Document ${document.id} failed:`, errorMessage);
        await this.documentRepository.updateStatus(document.id, tenantId, 'failed', errorMessage);
      }
    });
  }

  private async processWithAIUnderstanding(
    document: Document,
    content: string,
    agentId: string,
    tenantId: string,
    now: Date
  ): Promise<Chunk[]> {
    const sessionId = randomUUID();
    const session = new ProcessingSession({
      id: sessionId,
      documentId: document.id,
      agentId,
      tenantId,
      stage: 'extracting',
      rawContent: content,
      totalChunks: Math.ceil(content.length / 2000),
      processedChunks: 0,
      aiSummary: null,
      errorMessage: null,
      createdAt: now,
      completedAt: null,
    });

    await this.sessionRepository!.save(session);

    try {
      const result = await this.understandingService!.processDocument(
        sessionId,
        document.id,
        agentId,
        tenantId,
        content
      );

      if (!result.success) {
        throw new Error(result.error || 'AI understanding failed');
      }

      await this.sessionRepository!.updateStage(sessionId, tenantId, 'completed');

      const chunks = result.chunks.map((chunk, index) => new Chunk({
        id: randomUUID(),
        documentId: document.id,
        agentId,
        tenantId,
        content: chunk.content,
        metadata: {
          section: chunk.metadata.sourceSection,
          keywords: chunk.metadata.keywords,
        },
        chunkIndex: chunk.metadata.chunkIndex ?? index,
        createdAt: now,
      }));

      await this.cleanupSession(sessionId);
      return chunks;
    } catch (error) {
      await this.sessionRepository!.updateStage(
        sessionId, 
        tenantId, 
        'failed', 
        error instanceof Error ? error.message : 'Unknown error'
      );
      await this.cleanupSession(sessionId);
      throw error;
    }
  }

  private async cleanupSession(sessionId: string): Promise<void> {
    try {
      await this.sessionRepository!.deleteMessages(sessionId);
    } catch (error) {
      console.warn('[CleanupSession] Failed to clean up session messages:', error);
    }
  }

  private async processWithSimpleChunking(
    document: Document,
    content: string,
    agentId: string,
    tenantId: string,
    now: Date
  ): Promise<Chunk[]> {
    const extractedText = await this.documentProcessor.extractText(content, 'text/plain');
    const processedChunks = this.documentProcessor.chunkText(extractedText);

    return processedChunks.map(pc => new Chunk({
      id: randomUUID(),
      documentId: document.id,
      agentId,
      tenantId,
      content: pc.content,
      metadata: pc.metadata,
      chunkIndex: pc.chunkIndex,
      createdAt: now,
    }));
  }
}
