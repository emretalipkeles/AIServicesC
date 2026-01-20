import type { IQueryHandler } from '../../../interfaces/IQueryBus';
import type { GetDelayAnalysisProjectQuery } from '../GetDelayAnalysisProjectQuery';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { DelayAnalysisProjectDto } from '../../dto/DelayAnalysisProjectDto';

export class GetDelayAnalysisProjectQueryHandler 
  implements IQueryHandler<GetDelayAnalysisProjectQuery, DelayAnalysisProjectDto | null> {
  
  constructor(private readonly projectRepository: IDelayAnalysisProjectRepository) {}

  async handle(query: GetDelayAnalysisProjectQuery): Promise<DelayAnalysisProjectDto | null> {
    const tenantId = query.tenantId ?? 'default';
    const project = await this.projectRepository.findById(query.projectId, tenantId);
    
    if (!project) {
      return null;
    }

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
