import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { DeleteDelayAnalysisProjectCommand } from '../DeleteDelayAnalysisProjectCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';

export class DeleteDelayAnalysisProjectCommandHandler 
  implements ICommandHandler<DeleteDelayAnalysisProjectCommand, void> {
  
  constructor(private readonly projectRepository: IDelayAnalysisProjectRepository) {}

  async handle(command: DeleteDelayAnalysisProjectCommand): Promise<void> {
    const tenantId = command.tenantId ?? 'default';
    await this.projectRepository.delete(command.projectId, tenantId);
  }
}
