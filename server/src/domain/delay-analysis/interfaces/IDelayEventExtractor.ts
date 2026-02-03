import type { DelayEventCategory } from '../entities/ContractorDelayEvent';
import type { ProjectDocumentType } from '../entities/ProjectDocument';
import type { TokenUsageCallback } from './ITokenUsageRecorder';
import type { IDRWorkActivity } from './IDocumentExtractionStrategy';

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
  matchedActivityId?: string;
  matchedActivityDescription?: string;
  matchedActivityWbs?: string;
  matchConfidence?: number;
  matchReasoning?: string;
}

export interface ExtractionResult {
  events: ExtractedDelayEvent[];
  documentId: string;
  totalEventsFound: number;
  strategyUsed?: string;
  baseConfidence?: number;
  delayIsCertain?: boolean;
  /**
   * Work activities extracted from the IDR's "Contractor's Work Activity" table.
   * These are used for fast-path activity matching.
   */
  workActivities?: IDRWorkActivity[];
}

export interface ExtractionOptions {
  runId?: string;
  onTokenUsage?: TokenUsageCallback;
  documentType?: ProjectDocumentType;
  tenantId?: string;
  projectId?: string;
  enableToolBasedMatching?: boolean;
}

export interface IDelayEventExtractor {
  extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult>;
}
