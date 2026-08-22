import type { ScheduleActivity } from '../entities/ScheduleActivity';
import type { TokenUsageCallback } from './ITokenUsageRecorder';
import type { IDRWorkActivity } from './IDocumentExtractionStrategy';
import type { PodReport } from '../entities/PodReport';

export interface MatchResult {
  matchedActivityId: string;
  cpmActivityId: string;
  cpmActivityDescription: string;
  wbs: string | null;
  confidence: number;
  reasoning: string;
  matchedViaIDRActivity?: boolean;
  /**
   * True when a POD report for the event's date independently corroborated this match
   * (by cost code or work-type/location keyword overlap). Stored so downstream code can mark
   * the delay event's metadata without re-deriving the evidence.
   */
  podCorroborated?: boolean;
}

/**
 * POD evidence for a single delay event's date, handed to the matcher through its options
 * (OCP: matching behavior is extended, not rewritten) so it can rank candidates and enrich
 * both matching prompts. `contextText` is pre-rendered, size-capped, untrusted-content-safe
 * prompt text; `reports` is the structured tree used for pure ranking/corroboration lookup.
 */
export interface PodMatchEvidence {
  contextText: string | null;
  reports: PodReport[];
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
  /**
   * POD (Play of the Day) evidence for the event's date, if a POD report exists for it.
   * Optional: when absent, matching behaves exactly as it did before POD-aware matching.
   */
  podEvidence?: PodMatchEvidence;
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
