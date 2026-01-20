import type { ICommandHandler } from '../../../interfaces/ICommandBus';
import type { UpdateDelayAnalysisProjectCommand } from '../UpdateDelayAnalysisProjectCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { DelayAnalysisProjectDto } from '../../dto/DelayAnalysisProjectDto';
import { DelayAnalysisProject } from '../../../../domain/delay-analysis/entities/DelayAnalysisProject';

export class UpdateDelayAnalysisProjectCommandHandler 
  implements ICommandHandler<UpdateDelayAnalysisProjectCommand, DelayAnalysisProjectDto> {
  
  constructor(private readonly projectRepository: IDelayAnalysisProjectRepository) {}

  async handle(command: UpdateDelayAnalysisProjectCommand): Promise<DelayAnalysisProjectDto> {
    const tenantId = command.tenantId ?? 'default';
    
    const existingProject = await this.projectRepository.findById(command.projectId, tenantId);
    if (!existingProject) {
      throw new Error(`Project with id ${command.projectId} not found`);
    }

    const updatedProject = new DelayAnalysisProject({
      id: existingProject.id,
      tenantId: existingProject.tenantId,
      name: command.name ?? existingProject.name,
      description: command.description ?? existingProject.description,
      contractNumber: command.contractNumber ?? existingProject.contractNumber,
      noticeToProceedDate: command.noticeToProceedDate ?? existingProject.noticeToProceedDate,
      status: command.status ?? existingProject.status,
      createdAt: existingProject.createdAt,
      updatedAt: new Date(),
    });

    await this.projectRepository.update(updatedProject);

    return {
      id: updatedProject.id,
      tenantId: updatedProject.tenantId,
      name: updatedProject.name,
      description: updatedProject.description,
      contractNumber: updatedProject.contractNumber,
      noticeToProceedDate: updatedProject.noticeToProceedDate,
      status: updatedProject.status,
      createdAt: updatedProject.createdAt,
      updatedAt: updatedProject.updatedAt,
    };
  }
}
