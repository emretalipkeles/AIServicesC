import type { IQueryHandler } from '../../../interfaces/IQueryBus';
import type { ListDelayAnalysisProjectsQuery } from '../ListDelayAnalysisProjectsQuery';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { DelayAnalysisProjectDto } from '../../dto/DelayAnalysisProjectDto';

export class ListDelayAnalysisProjectsQueryHandler 
  implements IQueryHandler<ListDelayAnalysisProjectsQuery, DelayAnalysisProjectDto[]> {
  
  constructor(private readonly projectRepository: IDelayAnalysisProjectRepository) {}

  async handle(query: ListDelayAnalysisProjectsQuery): Promise<DelayAnalysisProjectDto[]> {
    const tenantId = query.tenantId ?? 'default';
    const projects = await this.projectRepository.findAll(tenantId);

    return projects.map(project => ({
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      description: project.description,
      contractNumber: project.contractNumber,
      noticeToProceedDate: project.noticeToProceedDate,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
  }
}
