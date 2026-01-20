import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { DeleteDocumentCommand } from '../DeleteDocumentCommand';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import type { IChunkRepository } from '../../../domain/repositories/IChunkRepository';

export class DeleteDocumentCommandHandler implements ICommandHandler<DeleteDocumentCommand, void> {
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly chunkRepository: IChunkRepository
  ) {}

  async handle(command: DeleteDocumentCommand): Promise<void> {
    const tenantId = command.tenantId ?? 'default';

    const document = await this.documentRepository.findById(command.documentId, tenantId);
    if (!document) {
      throw new Error(`Document not found: ${command.documentId}`);
    }

    await this.chunkRepository.deleteByDocumentId(command.documentId, tenantId);
    await this.documentRepository.delete(command.documentId, tenantId);
  }
}
