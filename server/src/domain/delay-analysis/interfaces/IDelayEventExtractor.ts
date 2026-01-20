import type { DelayEventCategory } from '../entities/ContractorDelayEvent';

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

export interface IDelayEventExtractor {
  extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string
  ): Promise<ExtractionResult>;
}
