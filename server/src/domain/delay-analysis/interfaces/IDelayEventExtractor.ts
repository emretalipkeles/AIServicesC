import type { DelayEventCategory } from '../entities/ContractorDelayEvent';
import type { TokenUsageCallback } from './ITokenUsageRecorder';

export interface ExtractedDelayEvent {
  eventDescription: string;
  eventCategory: DelayEventCategory | null;
  eventDate: Date | null;
  impactDurationHours: number | null;
  sourceReference: string;
  extractedFromCode: string;
}

export interface ExtractionResult {
  events: ExtractedDelayEvent[];
  documentId: string;
  totalEventsFound: number;
}

export interface ExtractionOptions {
  onTokenUsage?: TokenUsageCallback;
}

export interface IDelayEventExtractor {
  extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult>;
}
