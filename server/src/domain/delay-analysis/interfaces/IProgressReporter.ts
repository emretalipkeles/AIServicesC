export type ProgressStage = 
  | 'uploading'
  | 'parsing_pdf'
  | 'extracting_text'
  | 'filtering_dates'
  | 'processing_batch'
  | 'ai_processing'
  | 'saving_activities'
  | 'complete'
  | 'error'
  // Analysis-specific stages
  | 'loading_documents'
  | 'extracting_events'
  | 'deduplicating_events'
  | 'loading_activities'
  | 'matching_events'
  | 'saving_events';

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  percentage: number;
  details?: {
    current?: number;
    total?: number;
    batchNumber?: number;
    totalBatches?: number;
    strategyUsed?: string;
    baseConfidence?: number;
  };
}

export interface IProgressReporter {
  report(event: ProgressEvent): void;
  complete(message: string, result?: unknown): void;
  error(message: string, error?: Error): void;
}

export class NoOpProgressReporter implements IProgressReporter {
  report(_event: ProgressEvent): void {}
  complete(_message: string, _result?: unknown): void {}
  error(_message: string, _error?: Error): void {}
}
