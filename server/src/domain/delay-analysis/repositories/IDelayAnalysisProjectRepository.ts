import type { DelayAnalysisProject } from '../entities/DelayAnalysisProject';

export interface IDelayAnalysisProjectRepository {
  findById(id: string, tenantId: string): Promise<DelayAnalysisProject | null>;
  findAll(tenantId: string): Promise<DelayAnalysisProject[]>;
  save(project: DelayAnalysisProject): Promise<void>;
  update(project: DelayAnalysisProject): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}
