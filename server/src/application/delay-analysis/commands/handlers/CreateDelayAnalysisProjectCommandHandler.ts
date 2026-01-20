import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { CreateDelayAnalysisProjectCommand } from '../CreateDelayAnalysisProjectCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { DelayAnalysisProjectDto } from '../../dto/DelayAnalysisProjectDto';
import { DelayAnalysisProject } from '../../../../domain/delay-analysis/entities/DelayAnalysisProject';
import { randomUUID } from 'crypto';

export class CreateDelayAnalysisProjectCommandHandler 
  implements ICommandHandler<CreateDelayAnalysisProjectCommand, DelayAnalysisProjectDto> {
  
  constructor(private readonly projectRepository: IDelayAnalysisProjectRepository) {}

  async handle(command: CreateDelayAnalysisProjectCommand): Promise<DelayAnalysisProjectDto> {
    const tenantId = command.tenantId ?? 'default';
    const now = new Date();
    
    const project = new DelayAnalysisProject({
      id: randomUUID(),
      tenantId,
      name: command.name,
      description: command.description ?? null,
      contractNumber: command.contractNumber ?? null,
      noticeToProceedDate: command.noticeToProceedDate ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await this.projectRepository.save(project);

    return {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      description: project.description,
      contractNumber: project.contractNumber,
      noticeToProceedDate: project.noticeToProceedDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
