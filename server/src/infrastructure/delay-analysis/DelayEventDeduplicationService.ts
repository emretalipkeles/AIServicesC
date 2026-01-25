import type { 
  IDelayEventDeduplicationService,
  ExtractedEventWithSource,
  DeduplicatedEvent 
} from '../../domain/delay-analysis/interfaces/IDelayEventDeduplicationService';
import type { ExtractedDelayEvent } from '../../domain/delay-analysis/interfaces/IDelayEventExtractor';

interface DeduplicationEntry {
  event: ExtractedDelayEvent;
  sourceDocumentIds: Set<string>;
  primarySourceDocumentId: string;
}

export class DelayEventDeduplicationService implements IDelayEventDeduplicationService {
  deduplicateWithSources(events: ExtractedEventWithSource[]): DeduplicatedEvent[] {
    if (events.length === 0) {
      return [];
    }

    const deduplicationMap = new Map<string, DeduplicationEntry>();

    for (const { event, sourceDocumentId } of events) {
      const key = this.generateDeduplicationKey(event);
      const existing = deduplicationMap.get(key);

      if (!existing) {
        deduplicationMap.set(key, {
          event,
          sourceDocumentIds: new Set([sourceDocumentId]),
          primarySourceDocumentId: sourceDocumentId,
        });
      } else {
        existing.sourceDocumentIds.add(sourceDocumentId);
        const mergedEvent = this.mergeEvents(existing.event, event);
        if ((event.confidenceScore || 0) > (existing.event.confidenceScore || 0)) {
          existing.primarySourceDocumentId = sourceDocumentId;
        }
        existing.event = mergedEvent;
      }
    }

    return Array.from(deduplicationMap.values()).map(entry => ({
      event: entry.event,
      sourceDocumentIds: Array.from(entry.sourceDocumentIds),
      primarySourceDocumentId: entry.primarySourceDocumentId,
    }));
  }

  private generateDeduplicationKey(event: ExtractedDelayEvent): string {
    const referenceNumber = this.extractReferenceNumber(event.sourceReference);
    const dateKey = event.eventDate ? event.eventDate.toISOString().split('T')[0] : 'no-date';
    const categoryKey = event.eventCategory || 'unknown';
    
    if (referenceNumber) {
      return `ref:${referenceNumber.toLowerCase()}`;
    }

    const descriptionKey = this.normalizeDescription(event.eventDescription);
    return `desc:${categoryKey}:${dateKey}:${descriptionKey}`;
  }

  private extractReferenceNumber(sourceReference: string): string | null {
    const ncrPattern = /NCR[-\s]?\d+/i;
    const idrPattern = /IDR[-\s]?\d+/i;
    const fmPattern = /FM[-\s]?\d+/i;

    const match = sourceReference.match(ncrPattern) 
      || sourceReference.match(idrPattern)
      || sourceReference.match(fmPattern);

    return match ? match[0].replace(/\s/g, '-') : null;
  }

  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5)
      .join('-');
  }

  private mergeEvents(existing: ExtractedDelayEvent, incoming: ExtractedDelayEvent): ExtractedDelayEvent {
    const higherConfidence = (existing.confidenceScore || 0) >= (incoming.confidenceScore || 0) 
      ? existing 
      : incoming;

    return {
      ...higherConfidence,
      eventDescription: this.mergeDescriptions(existing.eventDescription, incoming.eventDescription),
      impactDurationHours: existing.impactDurationHours ?? incoming.impactDurationHours,
      sourceReference: this.mergeSourceReferences(existing.sourceReference, incoming.sourceReference),
      confidenceScore: Math.max(existing.confidenceScore || 0, incoming.confidenceScore || 0),
    };
  }

  private mergeDescriptions(desc1: string, desc2: string): string {
    if (desc1.length > desc2.length) {
      return desc1;
    }
    return desc2;
  }

  private mergeSourceReferences(ref1: string, ref2: string): string {
    if (ref1 === ref2) {
      return ref1;
    }
    const refs = new Set([ref1, ref2].filter(r => r.trim().length > 0));
    return Array.from(refs).join('; ');
  }
}
