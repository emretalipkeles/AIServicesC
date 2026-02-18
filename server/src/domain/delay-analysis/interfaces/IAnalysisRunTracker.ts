export interface AnalysisRunStatus {
  runId: string;
  projectId: string;
  tenantId: string;
  status: 'running' | 'completed' | 'failed';
  stage: string;
  message: string;
  percentage: number;
  startedAt: Date;
  completedAt: Date | null;
  result?: {
    eventsExtracted: number;
    eventsMatched: number;
    documentsProcessed: number;
  };
  errorMessage?: string;
}

export interface IAnalysisRunTracker {
  start(runId: string, projectId: string, tenantId: string): void;

  updateProgress(runId: string, stage: string, message: string, percentage: number): void;

  complete(
    runId: string,
    result: { eventsExtracted: number; eventsMatched: number; documentsProcessed: number }
  ): void;

  fail(runId: string, errorMessage: string): void;

  getActiveRun(projectId: string, tenantId: string): AnalysisRunStatus | null;

  getRunById(runId: string): AnalysisRunStatus | null;
}
