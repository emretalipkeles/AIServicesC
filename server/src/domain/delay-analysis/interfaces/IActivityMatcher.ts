import type { ScheduleActivity } from '../entities/ScheduleActivity';

export interface MatchResult {
  matchedActivityId: string;
  cpmActivityId: string;
  cpmActivityDescription: string;
  wbs: string | null;
  confidence: number;
  reasoning: string;
}

export interface IActivityMatcher {
  matchEventToActivities(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[]
  ): Promise<MatchResult | null>;
  
  matchBatch(
    events: Array<{
      id: string;
      description: string;
      eventDate: Date | null;
    }>,
    activities: ScheduleActivity[]
  ): Promise<Map<string, MatchResult>>;
}
