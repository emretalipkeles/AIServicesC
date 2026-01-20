import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { UploadDocumentCommand } from '../UploadDocumentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import type { IChunkRepository } from '../../../domain/repositories/IChunkRepository';
import type { IDocumentProcessor } from '../../services/IDocumentProcessor';
import type { AgentDocumentDto } from '../../dto/AgentDto';
import { Document } from '../../../domain/entities/Document';
import { Chunk } from '../../../domain/entities/Chunk';
import { randomUUID } from 'crypto';

export class UploadDocumentCommandHandler implements ICommandHandler<UploadDocumentCommand, AgentDocumentDto> {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly chunkRepository: IChunkRepository,
    private readonly documentProcessor: IDocumentProcessor
  ) {}

  async handle(command: UploadDocumentCommand): Promise<AgentDocumentDto> {
    const tenantId = command.tenantId ?? 'default';

    const agent = await this.agentRepository.findById(command.agentId, tenantId);
    if (!agent) {
      throw new Error(`Agent not found: ${command.agentId}`);
    }

    const now = new Date();
    const document = new Document({
      id: randomUUID(),
      agentId: command.agentId,
      tenantId,
      filename: command.filename,
      contentType: command.contentType,
      rawContent: command.rawContent,
      status: 'processing',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.documentRepository.save(document);

    try {
      const extractedText = await this.documentProcessor.extractText(
        command.rawContent,
        command.contentType
      );

      const processedChunks = this.documentProcessor.chunkText(extractedText);

      const chunks = processedChunks.map(pc => new Chunk({
        id: randomUUID(),
        documentId: document.id,
        agentId: command.agentId,
        tenantId,
        content: pc.content,
        metadata: pc.metadata,
        chunkIndex: pc.chunkIndex,
        createdAt: now,
      }));

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
}
