import type { IAnalysisRunTracker, AnalysisRunStatus } from '../../../../domain/delay-analysis/interfaces/IAnalysisRunTracker';

export interface GetAnalysisRunStatusQuery {
  projectId: string;
  tenantId: string;
}

export interface AnalysisRunStatusDto {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  message: string;
  percentage: number;
  startedAt: string;
  completedAt: string | null;
  result?: {
    eventsExtracted: number;
    eventsMatched: number;
    documentsProcessed: number;
  };
  errorMessage?: string;
}

export class GetAnalysisRunStatusQueryHandler {
  constructor(private readonly runTracker: IAnalysisRunTracker) {}

  execute(query: GetAnalysisRunStatusQuery): AnalysisRunStatusDto | null {
    const run = this.runTracker.getActiveRun(query.projectId, query.tenantId);
    if (!run) return null;
    return this.toDto(run);
  }

  private toDto(run: AnalysisRunStatus): AnalysisRunStatusDto {
    return {
      runId: run.runId,
      status: run.status,
      stage: run.stage,
      message: run.message,
      percentage: run.percentage,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      result: run.result,
      errorMessage: run.errorMessage,
    };
  }
}
