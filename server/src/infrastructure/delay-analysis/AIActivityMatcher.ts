import type { IActivityMatcher, MatchResult, MatchOptions } from '../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { ScheduleActivity } from '../../domain/delay-analysis/entities/ScheduleActivity';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { IDRWorkActivity } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const IDR_FAST_MATCH_PROMPT = `You are an expert construction schedule analyst. Match this delay event to ONE of the activities that were being worked on that day.

## Delay Event:
{eventDescription}

## Event Date: {eventDate}

## Activities Being Worked On (from Inspector's Report):
{activitiesList}

## Instructions:
The inspector recorded these specific activities as being worked on the day this delay occurred. Match the delay event to the most relevant activity.

Since the inspector already identified these as the day's work, confidence should be HIGH (85%+) if the work types align.

## Response Format (JSON only):
{
  "activityId": "the exact Activity ID",
  "confidence": <85-100>,
  "reasoning": "Brief explanation of the match"
}

If none of the activities match the delay event at all, respond with: null
`;

const MATCHING_PROMPT = `You are an expert construction schedule analyst specializing in delay claims for heavy civil and transit projects. Your task is to match a contractor-caused delay event to the most relevant CPM schedule activity.

## Delay Event to Match:
{eventDescription}

## Event Date: {eventDate}

## Available CPM Schedule Activities:
Format: Activity ID | WBS | Description | Planned Start | Planned Finish
{activitiesList}

## Matching Instructions:
1. Identify the TYPE of work in the delay event (excavation, piling, utilities, concrete, electrical, etc.)
2. Identify any LOCATION references (station numbers, street names, structure names)
3. Find the activity that matches BOTH the work type AND location/timeframe
4. Consider if the event date falls within or near the activity's planned dates

## Confidence Scoring Criteria (BE PRECISE):
- **90-100%**: EXACT match - delay event explicitly names the same work AND location as the activity (e.g., "excavator broke at Station 15 trenching" matches "Utility Trenching Sta 14-16")
- **75-89%**: STRONG match - same work type with overlapping location OR same location with related work type
- **60-74%**: MODERATE match - same general work category (e.g., both are utility work) but different specific tasks or unclear location
- **45-59%**: WEAK match - loosely related work type OR timing-based match only
- **30-44%**: POOR match - only tangential connection, included because nothing better exists
- **Below 30**: NO match - return null

## Critical Rules:
- DO NOT default to middle-range scores. Evaluate each match carefully.
- A perfect keyword match in description should score 85+
- If the delay event mentions specific equipment/work and an activity describes that exact work, score 80+
- If matching based primarily on date overlap without strong content match, score below 60

## Response Format (JSON only, no markdown):
{
  "activityId": "the exact Activity ID from the list",
  "confidence": <number 30-100>,
  "reasoning": "Specific explanation citing keywords/location/dates that led to this match"
}

If no activity scores above 30%, respond with: null
`;

export class AIActivityMatcher implements IActivityMatcher {
  constructor(private readonly aiClient: IAIClient) {}

  async matchEventToActivities(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null> {
    if (activities.length === 0) {
      return null;
    }

    if (options?.idrWorkActivities && options.idrWorkActivities.length > 0) {
      console.log(`[AI] MATCHING: Trying IDR fast-match with ${options.idrWorkActivities.length} work activities...`);
      const fastMatchResult = await this.tryFastMatch(
        eventDescription,
        eventDate,
        activities,
        options.idrWorkActivities,
        options
      );

      if (fastMatchResult) {
        console.log(`[AI] MATCHING: Fast-match succeeded -> ${fastMatchResult.cpmActivityId} (${fastMatchResult.confidence}% confidence)`);
        return fastMatchResult;
      }

      console.log('[AI] MATCHING: Fast-match failed, falling back to full schedule...');
    }

    return this.matchAgainstFullSchedule(eventDescription, eventDate, activities, options);
  }

  private async tryFastMatch(
    eventDescription: string,
    eventDate: Date | null,
    allActivities: ScheduleActivity[],
    idrWorkActivities: IDRWorkActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null> {
    const idrActivityIds = new Set(idrWorkActivities.map(wa => wa.activityId));
    const priorityActivities = allActivities.filter(a => idrActivityIds.has(a.activityId));

    if (priorityActivities.length === 0) {
      console.log('[AIActivityMatcher] No matching schedule activities found for IDR work activities:', 
        idrWorkActivities.map(wa => wa.activityId));
      return null;
    }

    console.log(`[AI] MATCHING: Fast-matching against ${priorityActivities.length} IDR activities`);

    const activitiesList = idrWorkActivities
      .map(wa => `${wa.activityId} | ${wa.description} | ${wa.comments || '-'}`)
      .join('\n');

    const prompt = IDR_FAST_MATCH_PROMPT
      .replace('{eventDescription}', eventDescription)
      .replace('{eventDate}', eventDate?.toISOString().split('T')[0] || 'Unknown')
      .replace('{activitiesList}', activitiesList);

    try {
      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 500,
        temperature: 0.1,
      });

      if (options?.onTokenUsage && options?.runId) {
        await options.onTokenUsage({
          runId: options.runId,
          operation: 'activity_matching_fast',
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          metadata: { idrActivitiesCount: priorityActivities.length },
        });
      }

      const result = this.parseMatchResponse(response.content, priorityActivities);
      
      if (result && result.confidence >= 85) {
        return {
          ...result,
          matchedViaIDRActivity: true,
          reasoning: `[IDR Fast-Match] ${result.reasoning}`,
        };
      }

      console.log('[AIActivityMatcher] Fast-match result below threshold:', result?.confidence);
      return null;
    } catch (error) {
      console.error('[AIActivityMatcher] Error in fast-match:', error);
      return null;
    }
  }

  private async matchAgainstFullSchedule(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null> {
    const activitiesList = activities
      .slice(0, 100)
      .map(a => `${a.activityId} | ${a.wbs || '-'} | ${a.activityDescription} | ${a.plannedStartDate?.toISOString().split('T')[0] || '-'} | ${a.plannedFinishDate?.toISOString().split('T')[0] || '-'}`)
      .join('\n');

    const prompt = MATCHING_PROMPT
      .replace('{eventDescription}', eventDescription)
      .replace('{eventDate}', eventDate?.toISOString().split('T')[0] || 'Unknown')
      .replace('{activitiesList}', activitiesList);

    try {
      console.log(`[AI] MATCHING: Full schedule match for event: "${eventDescription.substring(0, 80)}..." (${activities.length} activities)`);

      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 1000,
        temperature: 0.1,
      });

      console.log(`[AI] MATCHING: Completed - used ${response.inputTokens} input + ${response.outputTokens} output tokens`);

      if (options?.onTokenUsage && options?.runId) {
        await options.onTokenUsage({
          runId: options.runId,
          operation: 'activity_matching',
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          metadata: { activitiesCount: activities.length },
        });
      }

      const result = this.parseMatchResponse(response.content, activities);
      
      if (result) {
        console.log(`[AI] MATCHING: Result -> ${result.cpmActivityId} (${result.confidence}% confidence)`);
      } else {
        console.log('[AI] MATCHING: Result -> No match found');
      }

      return result;
    } catch (error) {
      console.error('[AIActivityMatcher] Error matching activity:', error);
      return null;
    }
  }

  async matchBatch(
    events: Array<{ id: string; description: string; eventDate: Date | null }>,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<Map<string, MatchResult>> {
    const results = new Map<string, MatchResult>();

    for (const event of events) {
      const match = await this.matchEventToActivities(
        event.description,
        event.eventDate,
        activities,
        options
      );

      if (match) {
        results.set(event.id, match);
      }
    }

    return results;
  }

  private parseMatchResponse(
    response: string,
    activities: ScheduleActivity[]
  ): MatchResult | null {
    try {
      // Handle "null" response from AI
      if (response.trim().toLowerCase() === 'null') {
        return null;
      }

      // Strip markdown code blocks if present
      let cleanResponse = response;
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleanResponse = codeBlockMatch[1].trim();
      }

      // Extract JSON object from response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Try to clean common JSON issues (trailing commas, etc)
        const cleanedJson = jsonMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        parsed = JSON.parse(cleanedJson);
      }
      
      if (!parsed || parsed === null) {
        return null;
      }

      const activityId = String(parsed.activityId || '');
      const matchedActivity = activities.find(a => a.activityId === activityId);

      if (!matchedActivity) {
        return null;
      }

      const confidence = typeof parsed.confidence === 'number' 
        ? Math.min(100, Math.max(0, parsed.confidence))
        : 50;

      if (confidence < 30) {
        return null;
      }

      return {
        matchedActivityId: matchedActivity.id,
        cpmActivityId: matchedActivity.activityId,
        cpmActivityDescription: matchedActivity.activityDescription,
        wbs: matchedActivity.wbs,
        confidence,
        reasoning: String(parsed.reasoning || 'Matched by AI analysis'),
      };
    } catch (error) {
      console.error('Error parsing match response:', error);
      console.error('Raw response:', response.substring(0, 500));
      return null;
    }
  }
}
