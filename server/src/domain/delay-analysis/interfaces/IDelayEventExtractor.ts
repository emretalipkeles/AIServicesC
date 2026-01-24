import type { DelayEventCategory } from '../entities/ContractorDelayEvent';
import type { ProjectDocumentType } from '../entities/ProjectDocument';
import type { TokenUsageCallback } from './ITokenUsageRecorder';

export interface ExtractedDelayEvent {
  eventDescription: string;
  eventCategory: DelayEventCategory | null;
  eventDate: Date | null;
  impactDurationHours: number | null;
  sourceReference: string;
  extractedFromCode: string;
  confidenceScore?: number;
  responsibilityConfirmed?: boolean;
  reworkDescription?: string;
}

export interface ExtractionResult {
  events: ExtractedDelayEvent[];
  documentId: string;
  totalEventsFound: number;
  strategyUsed?: string;
  baseConfidence?: number;
  delayIsCertain?: boolean;
}

export interface ExtractionOptions {
  runId?: string;
  onTokenUsage?: TokenUsageCallback;
  documentType?: ProjectDocumentType;
}

export interface IDelayEventExtractor {
  extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult>;
}
