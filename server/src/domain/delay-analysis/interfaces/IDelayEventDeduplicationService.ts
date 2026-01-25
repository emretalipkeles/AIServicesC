import type { ExtractedDelayEvent } from './IDelayEventExtractor';

export interface ExtractedEventWithSource {
  event: ExtractedDelayEvent;
  sourceDocumentId: string;
}

export interface DeduplicatedEvent {
  event: ExtractedDelayEvent;
  sourceDocumentIds: string[];
  primarySourceDocumentId: string;
}

export interface IDelayEventDeduplicationService {
  deduplicateWithSources(events: ExtractedEventWithSource[]): DeduplicatedEvent[];
}
