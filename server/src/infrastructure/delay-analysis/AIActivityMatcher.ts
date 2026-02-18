import type { IActivityMatcher, MatchResult, MatchOptions } from '../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { ScheduleActivity } from '../../domain/delay-analysis/entities/ScheduleActivity';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { IDRWorkActivity } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const IDR_FORCE_MATCH_PROMPT = `You are an expert construction schedule analyst. Match this delay event to the BEST activity from the ones listed in the Inspector's Daily Report (IDR).

## Delay Event:
{eventDescription}

## Event Date: {eventDate}

## Activities Listed in the IDR Document:
{activitiesList}

## ABSOLUTE RULE — NO EXCEPTIONS:
These are the ONLY CPM activity IDs found in the Inspector's Daily Report for this day. You MUST select one of these activity IDs. Do NOT invent, guess, or use any activity ID that is not in the list above. Even if the delay event description does not perfectly match any of these activities, you MUST pick the closest one from this list.

The reasoning is simple: these are the activities the contractor was working on that day per the official report. The delay happened during one of these activities, even if the connection is indirect.

## Confidence Scoring (be honest about alignment quality):
- **85-100%**: Work type in delay clearly matches the activity description (e.g., "excavation delay" matches "Excavate Services")
- **70-84%**: Work type is related but not exact match (e.g., "equipment breakdown" during "Excavate Services" - equipment was used for that work)
- **50-69%**: Weak match - the delay happened during this work but activity description doesn't describe the delay's work type (e.g., "grade review at nearby location" during "Roadway demo at different intersection")
- **40-49%**: Forced match - no logical connection but this was the contractor's work that day, so the delay is associated with it by proximity/timing

## Response Format (JSON only):
{
  "activityId": "the EXACT Activity ID from the list above — must be one of the IDs shown",
  "confidence": <number between 40-100>,
  "reasoning": "Brief explanation of why this activity was selected from the IDR list"
}

YOU MUST RETURN A MATCH from the list above. Do not respond with null. Do not use any activity ID not shown above.
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
      console.log(`[AI] MATCHING: IDR activities present (${options.idrWorkActivities.length}) — will ONLY match to document activities, no fallback to full schedule`);
      const forceMatchResult = await this.tryForceMatchToIDRActivities(
        eventDescription,
        eventDate,
        activities,
        options.idrWorkActivities,
        options
      );

      if (forceMatchResult) {
        return forceMatchResult;
      }

      console.log('[AI] MATCHING: IDR force-match returned null unexpectedly — creating deterministic fallback to first IDR activity (NEVER falling back to full schedule)');
      const fallbackActivity = options.idrWorkActivities[0];
      const scheduleMatch = activities.find(a => a.activityId === fallbackActivity.activityId);
      return {
        matchedActivityId: scheduleMatch?.id ?? fallbackActivity.activityId,
        cpmActivityId: fallbackActivity.activityId,
        cpmActivityDescription: fallbackActivity.description,
        wbs: scheduleMatch?.wbs ?? null,
        confidence: 40,
        reasoning: `[IDR Activity Fallback] AI force-match failed to produce a result. Defaulting to first IDR activity ${fallbackActivity.activityId} ("${fallbackActivity.description}") because this activity was listed in the document. Manual verification recommended.`,
        matchedViaIDRActivity: true,
      };
    }

    return this.matchAgainstFullSchedule(eventDescription, eventDate, activities, options);
  }

  private async tryForceMatchToIDRActivities(
    eventDescription: string,
    eventDate: Date | null,
    allActivities: ScheduleActivity[],
    idrWorkActivities: IDRWorkActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null> {
    const idrActivityIds = new Set(idrWorkActivities.map(wa => wa.activityId));
    const priorityActivities = allActivities.filter(a => idrActivityIds.has(a.activityId));

    if (priorityActivities.length === 0) {
      console.log('[AIActivityMatcher] IDR activities not found in schedule:', 
        idrWorkActivities.map(wa => wa.activityId));
      
      const firstIDRActivity = idrWorkActivities[0];
      console.log(`[AI] MATCHING: Creating manual match to IDR activity ${firstIDRActivity.activityId} (not in schedule database)`);
      
      return {
        matchedActivityId: firstIDRActivity.activityId,
        cpmActivityId: firstIDRActivity.activityId,
        cpmActivityDescription: firstIDRActivity.description,
        wbs: null,
        confidence: 35,
        reasoning: `[IDR Activity - not in schedule] Activity ${firstIDRActivity.activityId} was listed in the IDR as being worked on this day, but is not found in the uploaded schedule. Manual verification recommended.`,
        matchedViaIDRActivity: true,
      };
    }

    console.log(`[AI] MATCHING: Force-matching to ${priorityActivities.length} schedule-matched IDR activities out of ${idrWorkActivities.length} total IDR activities`);

    const activitiesList = idrWorkActivities
      .map(wa => `${wa.activityId} | ${wa.description} | ${wa.comments || '-'}`)
      .join('\n');

    const prompt = IDR_FORCE_MATCH_PROMPT
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
          operation: 'activity_matching_idr_force',
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          metadata: { idrActivitiesCount: idrWorkActivities.length },
        });
      }

      const result = this.parseIDRForceMatchResponse(response.content, idrWorkActivities, allActivities);
      
      if (result) {
        const confidenceLevel = result.confidence >= 85 ? 'high' : 
                               result.confidence >= 70 ? 'good' :
                               result.confidence >= 50 ? 'weak' : 'forced';
        console.log(`[AI] MATCHING: IDR force-match succeeded -> ${result.cpmActivityId} (${result.confidence}% confidence, ${confidenceLevel} alignment)`);
        return {
          ...result,
          matchedViaIDRActivity: true,
          reasoning: `[IDR Activity Match - ${confidenceLevel} alignment] ${result.reasoning}`,
        };
      }

      console.log('[AIActivityMatcher] Force-match AI response could not be parsed — will use deterministic fallback');
      return null;
    } catch (error) {
      console.error('[AIActivityMatcher] Error in force-match:', error);
      return null;
    }
  }

  private async matchAgainstFullSchedule(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[],
    options?: MatchOptions
  ): Promise<MatchResult | null> {
    const filterDate = options?.reportDate || eventDate;
    let filteredActivities = activities;
    
    if (filterDate) {
      const originalCount = activities.length;
      filteredActivities = activities.filter(a => {
        const startDate = a.actualStartDate ?? a.plannedStartDate;
        if (!startDate) return true;
        return startDate <= filterDate;
      });
      
      if (filteredActivities.length < originalCount) {
        console.log(`[AI] MATCHING: Filtered activities by date (${filterDate.toISOString().split('T')[0]}): ${originalCount} -> ${filteredActivities.length} activities (using actual start dates when available)`);
      }
    }
    
    if (filteredActivities.length === 0) {
      console.log('[AI] MATCHING: No activities available after date filtering');
      return null;
    }

    const activitiesList = filteredActivities
      .slice(0, 100)
      .map(a => `${a.activityId} | ${a.wbs || '-'} | ${a.activityDescription} | ${a.plannedStartDate?.toISOString().split('T')[0] || '-'} | ${a.plannedFinishDate?.toISOString().split('T')[0] || '-'}`)
      .join('\n');

    const prompt = MATCHING_PROMPT
      .replace('{eventDescription}', eventDescription)
      .replace('{eventDate}', eventDate?.toISOString().split('T')[0] || 'Unknown')
      .replace('{activitiesList}', activitiesList);

    try {
      console.log(`[AI] MATCHING: Full schedule match for event: "${eventDescription.substring(0, 80)}..." (${filteredActivities.length} activities)`);

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
          metadata: { activitiesCount: filteredActivities.length },
        });
      }

      const result = this.parseMatchResponse(response.content, filteredActivities);
      
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

  private parseIDRForceMatchResponse(
    response: string,
    idrWorkActivities: IDRWorkActivity[],
    allScheduleActivities: ScheduleActivity[]
  ): MatchResult | null {
    try {
      if (response.trim().toLowerCase() === 'null') {
        console.log('[AIActivityMatcher] AI returned null for IDR force-match (should not happen)');
        return null;
      }

      let cleanResponse = response;
      const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleanResponse = codeBlockMatch[1].trim();
      }

      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[AIActivityMatcher] No JSON found in IDR force-match response');
        return null;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        const cleanedJson = jsonMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        parsed = JSON.parse(cleanedJson);
      }

      if (!parsed || parsed === null) {
        return null;
      }

      const aiActivityId = String(parsed.activityId || '');
      const idrActivity = idrWorkActivities.find(wa => wa.activityId === aiActivityId);

      if (!idrActivity) {
        console.log(`[AIActivityMatcher] AI returned activity "${aiActivityId}" which is NOT in the IDR list: [${idrWorkActivities.map(wa => wa.activityId).join(', ')}]`);
        return null;
      }

      const confidence = typeof parsed.confidence === 'number'
        ? Math.min(100, Math.max(40, parsed.confidence))
        : 50;

      const scheduleActivity = allScheduleActivities.find(a => a.activityId === aiActivityId);

      if (scheduleActivity) {
        return {
          matchedActivityId: scheduleActivity.id,
          cpmActivityId: scheduleActivity.activityId,
          cpmActivityDescription: scheduleActivity.activityDescription,
          wbs: scheduleActivity.wbs,
          confidence,
          reasoning: String(parsed.reasoning || 'Matched to IDR document activity'),
        };
      }

      console.log(`[AIActivityMatcher] IDR activity "${aiActivityId}" matched by AI but not found in schedule DB — returning as IDR-only match`);
      return {
        matchedActivityId: idrActivity.activityId,
        cpmActivityId: idrActivity.activityId,
        cpmActivityDescription: idrActivity.description,
        wbs: null,
        confidence: Math.max(40, Math.min(confidence, 50)),
        reasoning: `[IDR Activity - not in schedule] ${String(parsed.reasoning || '')} Activity ${idrActivity.activityId} was listed in the IDR but is not found in the uploaded schedule. Manual verification recommended.`,
      };
    } catch (error) {
      console.error('[AIActivityMatcher] Error parsing IDR force-match response:', error);
      console.error('Raw response:', response.substring(0, 500));
      return null;
    }
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
