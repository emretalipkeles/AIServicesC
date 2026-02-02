import type { ScheduleActivity } from '../entities/ScheduleActivity';
import type { TokenUsageCallback } from './ITokenUsageRecorder';
import type { IDRWorkActivity } from './IDocumentExtractionStrategy';

export interface MatchResult {
  matchedActivityId: string;
  cpmActivityId: string;
  cpmActivityDescription: string;
  wbs: string | null;
  confidence: number;
  reasoning: string;
  matchedViaIDRActivity?: boolean;
}

export interface MatchOptions {
  runId?: string;
  onTokenUsage?: TokenUsageCallback;
  /**
   * IDR work activities extracted from the document.
   * When provided, the matcher will first attempt to match against these
   * specific activities (fast-path) before falling back to the full schedule.
   */
  idrWorkActivities?: IDRWorkActivity[];
}

export interface IActivityMatcher {
  matchEventToActivities(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null>;
  
  matchBatch(
    events: Array<{
      id: string;
      description: string;
      eventDate: Date | null;
    }>,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<Map<string, MatchResult>>;
}
