import type { IAnalysisRunTracker, AnalysisRunStatus } from '../../domain/delay-analysis/interfaces/IAnalysisRunTracker';

const COMPLETED_RUN_TTL_MS = 5 * 60 * 1000;

export class InMemoryAnalysisRunTracker implements IAnalysisRunTracker {
  private runs = new Map<string, AnalysisRunStatus>();
  private projectIndex = new Map<string, string>();

  start(runId: string, projectId: string, tenantId: string): void {
    const indexKey = `${tenantId}:${projectId}`;
    const existingRunId = this.projectIndex.get(indexKey);
    if (existingRunId) {
      const existingRun = this.runs.get(existingRunId);
      if (existingRun && existingRun.status === 'running') {
        existingRun.status = 'failed';
        existingRun.completedAt = new Date();
        existingRun.errorMessage = 'Superseded by new analysis run';
      }
    }

    const status: AnalysisRunStatus = {
      runId,
      projectId,
      tenantId,
      status: 'running',
      stage: 'loading_documents',
      message: 'Starting analysis...',
      percentage: 0,
      startedAt: new Date(),
      completedAt: null,
    };

    this.runs.set(runId, status);
    this.projectIndex.set(indexKey, runId);
  }

  updateProgress(runId: string, stage: string, message: string, percentage: number): void {
    const run = this.runs.get(runId);
    if (run && run.status === 'running') {
      run.stage = stage;
      run.message = message;
      run.percentage = percentage;
    }
  }

  complete(
    runId: string,
    result: { eventsExtracted: number; eventsMatched: number; documentsProcessed: number }
  ): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'completed';
      run.completedAt = new Date();
      run.percentage = 100;
      run.message = `Analysis complete: ${result.eventsExtracted} events extracted, ${result.eventsMatched} matched`;
      run.result = result;
      this.scheduleCleanup(runId);
    }
  }

  fail(runId: string, errorMessage: string): void {
    const run = this.runs.get(runId);
    if (run) {
      run.status = 'failed';
      run.completedAt = new Date();
      run.errorMessage = errorMessage;
      this.scheduleCleanup(runId);
    }
  }

  getActiveRun(projectId: string, tenantId: string): AnalysisRunStatus | null {
    const indexKey = `${tenantId}:${projectId}`;
    const runId = this.projectIndex.get(indexKey);
    if (!runId) return null;

    const run = this.runs.get(runId);
    if (!run) return null;

    return { ...run };
  }

  getRunById(runId: string): AnalysisRunStatus | null {
    const run = this.runs.get(runId);
    if (!run) return null;
    return { ...run };
  }

  private scheduleCleanup(runId: string): void {
    setTimeout(() => {
      const run = this.runs.get(runId);
      if (run && run.status !== 'running') {
        this.runs.delete(runId);
        const indexKey = `${run.tenantId}:${run.projectId}`;
        if (this.projectIndex.get(indexKey) === runId) {
          this.projectIndex.delete(indexKey);
        }
      }
    }, COMPLETED_RUN_TTL_MS);
  }
}
