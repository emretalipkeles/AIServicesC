import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { ReindexAgentCommand } from '../ReindexAgentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import type { IChunkRepository } from '../../../domain/repositories/IChunkRepository';
import type { IDocumentProcessor } from '../../services/IDocumentProcessor';
import { Chunk } from '../../../domain/entities/Chunk';
import { randomUUID } from 'crypto';

export interface ReindexResult {
  agentId: string;
  documentsProcessed: number;
  chunksCreated: number;
  errors: string[];
}

export class ReindexAgentCommandHandler implements ICommandHandler<ReindexAgentCommand, ReindexResult> {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly documentRepository: IDocumentRepository,
    private readonly chunkRepository: IChunkRepository,
    private readonly documentProcessor: IDocumentProcessor
  ) {}

  async handle(command: ReindexAgentCommand): Promise<ReindexResult> {
    const tenantId = command.tenantId ?? 'default';

    const agent = await this.agentRepository.findById(command.agentId, tenantId);
    if (!agent) {
      throw new Error(`Agent not found: ${command.agentId}`);
    }

    await this.chunkRepository.deleteByAgentId(command.agentId, tenantId);

    const documents = await this.documentRepository.findByAgentId(command.agentId, tenantId);
    
    const result: ReindexResult = {
      agentId: command.agentId,
      documentsProcessed: 0,
      chunksCreated: 0,
      errors: [],
    };

    for (const document of documents) {
      try {
        await this.documentRepository.updateStatus(document.id, tenantId, 'processing');

        if (!document.rawContent) {
          await this.documentRepository.updateStatus(document.id, tenantId, 'failed', 'No content');
          result.errors.push(`${document.filename}: No content`);
          continue;
        }

        const extractedText = await this.documentProcessor.extractText(
          document.rawContent,
          document.contentType
        );

        const processedChunks = this.documentProcessor.chunkText(extractedText);
        const now = new Date();

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
        result.documentsProcessed++;
        result.chunksCreated += chunks.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await this.documentRepository.updateStatus(document.id, tenantId, 'failed', errorMessage);
        result.errors.push(`${document.filename}: ${errorMessage}`);
      }
    }

    return result;
  }
}
