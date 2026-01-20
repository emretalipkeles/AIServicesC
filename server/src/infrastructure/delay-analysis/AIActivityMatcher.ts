import type { IActivityMatcher, MatchResult } from '../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { ScheduleActivity } from '../../domain/delay-analysis/entities/ScheduleActivity';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const MATCHING_PROMPT = `You are an expert construction schedule analyst. Match the following delay event to the most relevant CPM schedule activity.

Delay Event:
{eventDescription}

Event Date: {eventDate}

Available Schedule Activities (Activity ID | WBS | Description | Start Date | Finish Date):
{activitiesList}

Instructions:
1. Analyze the delay event description and identify keywords related to work type, location, or discipline
2. Find the schedule activity that most closely relates to the delayed work
3. Consider the event date and whether the activity was active during that time
4. Return the best match with a confidence score (0-100)

Return a JSON object with:
- activityId: The ID of the best matching activity
- confidence: Score from 0-100 (100 = perfect match)
- reasoning: Brief explanation of why this activity was matched

If no reasonable match exists (confidence would be below 30), return null.
`;

export class AIActivityMatcher implements IActivityMatcher {
  constructor(private readonly aiClient: IAIClient) {}

  async matchEventToActivities(
    eventDescription: string,
    eventDate: Date | null,
    activities: ScheduleActivity[]
  ): Promise<MatchResult | null> {
    if (activities.length === 0) {
      return null;
    }

    const activitiesList = activities
      .slice(0, 100)
      .map(a => `${a.activityId} | ${a.wbs || '-'} | ${a.activityDescription} | ${a.plannedStartDate?.toISOString().split('T')[0] || '-'} | ${a.plannedFinishDate?.toISOString().split('T')[0] || '-'}`)
      .join('\n');

    const prompt = MATCHING_PROMPT
      .replace('{eventDescription}', eventDescription)
      .replace('{eventDate}', eventDate?.toISOString().split('T')[0] || 'Unknown')
      .replace('{activitiesList}', activitiesList);

    try {
      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 1000,
        temperature: 0.1,
      });

      return this.parseMatchResponse(response.content, activities);
    } catch (error) {
      console.error('Error matching activity:', error);
      return null;
    }
  }

  async matchBatch(
    events: Array<{ id: string; description: string; eventDate: Date | null }>,
    activities: ScheduleActivity[]
  ): Promise<Map<string, MatchResult>> {
    const results = new Map<string, MatchResult>();

    for (const event of events) {
      const match = await this.matchEventToActivities(
        event.description,
        event.eventDate,
        activities
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
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
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
      return null;
    }
  }
}
