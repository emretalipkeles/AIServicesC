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
   * When provided, the matcher MUST ONLY match against these activities.
   * It will NEVER fall back to the full schedule. All matches will use
   * 90-100% confidence because the activity IDs come from the document itself.
   */
  idrWorkActivities?: IDRWorkActivity[];
  /**
   * Report date from the document (e.g., from IDR "Day/Date" header).
   * Used to filter out activities that haven't started yet (planned_start_date > reportDate).
   */
  reportDate?: Date;
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
