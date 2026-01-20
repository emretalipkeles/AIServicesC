export type ProcessingStage = 'extracting' | 'understanding' | 'chunking' | 'completed' | 'failed';

export interface ProcessingSessionProps {
  id: string;
  documentId: string;
  agentId: string;
  tenantId: string;
  stage: ProcessingStage;
  rawContent: string | null;
  totalChunks: number;
  processedChunks: number;
  aiSummary: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export class ProcessingSession {
  readonly id: string;
  readonly documentId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly stage: ProcessingStage;
  readonly rawContent: string | null;
  readonly totalChunks: number;
  readonly processedChunks: number;
  readonly aiSummary: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;

  constructor(props: ProcessingSessionProps) {
    this.id = props.id;
    this.documentId = props.documentId;
    this.agentId = props.agentId;
    this.tenantId = props.tenantId;
    this.stage = props.stage;
    this.rawContent = props.rawContent;
    this.totalChunks = props.totalChunks;
    this.processedChunks = props.processedChunks;
    this.aiSummary = props.aiSummary;
    this.errorMessage = props.errorMessage;
    this.createdAt = props.createdAt;
    this.completedAt = props.completedAt;
  }

  withStage(stage: ProcessingStage): ProcessingSession {
    return new ProcessingSession({
      ...this,
      stage,
      completedAt: stage === 'completed' || stage === 'failed' ? new Date() : this.completedAt,
    });
  }

  withRawContent(rawContent: string, totalChunks: number): ProcessingSession {
    return new ProcessingSession({
      ...this,
      rawContent,
      totalChunks,
      stage: 'understanding',
    });
  }

  withChunkProcessed(): ProcessingSession {
    const newProcessedChunks = this.processedChunks + 1;
    return new ProcessingSession({
      ...this,
      processedChunks: newProcessedChunks,
      stage: newProcessedChunks >= this.totalChunks ? 'chunking' : 'understanding',
    });
  }

  withAISummary(summary: string): ProcessingSession {
    return new ProcessingSession({
      ...this,
      aiSummary: summary,
    });
  }

  withError(errorMessage: string): ProcessingSession {
    return new ProcessingSession({
      ...this,
      stage: 'failed',
      errorMessage,
      completedAt: new Date(),
    });
  }

  isComplete(): boolean {
    return this.stage === 'completed';
  }

  isFailed(): boolean {
    return this.stage === 'failed';
  }

  isProcessingComplete(): boolean {
    return this.processedChunks >= this.totalChunks && this.totalChunks > 0;
  }

  getProgress(): number {
    if (this.totalChunks === 0) return 0;
    return Math.round((this.processedChunks / this.totalChunks) * 100);
  }
}
