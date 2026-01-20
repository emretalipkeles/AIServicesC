import type { ScheduleActivity } from '../entities/ScheduleActivity';
import type { TokenUsageCallback } from './ITokenUsageRecorder';

export interface MatchResult {
  matchedActivityId: string;
  cpmActivityId: string;
  cpmActivityDescription: string;
  wbs: string | null;
  confidence: number;
  reasoning: string;
}

export interface MatchOptions {
  runId?: string;
  onTokenUsage?: TokenUsageCallback;
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
