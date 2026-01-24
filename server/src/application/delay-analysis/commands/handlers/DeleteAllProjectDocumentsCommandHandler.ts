import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { DeleteAllProjectDocumentsCommand } from '../DeleteAllProjectDocumentsCommand';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';

export interface DeleteAllProjectDocumentsResult {
  deletedDocumentsCount: number;
  deletedEventsCount: number;
}

export class DeleteAllProjectDocumentsCommandHandler
  implements ICommandHandler<DeleteAllProjectDocumentsCommand, DeleteAllProjectDocumentsResult> {
  
  constructor(
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly delayEventRepository: IContractorDelayEventRepository
  ) {}

  async handle(command: DeleteAllProjectDocumentsCommand): Promise<DeleteAllProjectDocumentsResult> {
    const tenantId = command.tenantId ?? 'default';

    const deletedEventsCount = await this.delayEventRepository.deleteByProjectId(
      command.projectId,
      tenantId
    );

    const deletedDocumentsCount = await this.documentRepository.deleteByProjectId(
      command.projectId,
      tenantId
    );

    return {
      deletedDocumentsCount,
      deletedEventsCount,
    };
  }
}
