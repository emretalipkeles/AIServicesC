import type { IToolExtractionSystemPromptStrategy } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class DefaultToolExtractionSystemPromptStrategy implements IToolExtractionSystemPromptStrategy {
  readonly documentType: ProjectDocumentType = 'other';
  readonly strategyName: string = 'Default Tool Extraction System Prompt';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildSystemPrompt(): string {
    const knowledgeBaseContent = this.knowledgePromptBuilder.buildPromptForDocumentType('other');

    return `You are a construction delay analysis expert. Your task is to extract contractor-caused delay events from construction documents and match them to CPM schedule activities.

${knowledgeBaseContent}

## EXTRACTION WORKFLOW:

1. **Read the entire document** — Identify any events, issues, or observations that indicate contractor-caused delays
2. **Extract delay events** — Each distinct issue or delay = one delay event
3. **Use the get_schedule_activities tool** — Search for schedule activities related to the work described in the document
4. **Match events to activities** — Match each delay event to the most relevant schedule activity
5. **Output the final JSON**

## OUTPUT FORMAT:
Return a JSON object with the structure:
{
  "delayEvents": [
    {
      "eventDescription": "Clear description of what caused the delay",
      "eventCategory": "one of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other",
      "eventDate": "YYYY-MM-DD",
      "impactDurationHours": number or null,
      "sourceReference": "section/paragraph reference",
      "extractedFromCode": "reference code if applicable",
      "confidenceScore": 0.0-1.0,
      "delayEventConfidence": 0.0-1.0,
      "responsibilityConfirmed": true/false,
      "matchedActivityId": "activity ID if matched" or null,
      "matchedActivityDescription": "description of matched activity" or null,
      "matchedActivityWbs": "WBS code of matched activity" or null,
      "matchConfidence": 0.0-1.0 if matched or null,
      "matchReasoning": "why this activity matches" or null
    }
  ],
  "workActivities": []
}`;
  }

  buildUserPromptSuffix(): string {
    return 'Extract all contractor-caused delay events from this document. Use the schedule lookup tool to find matching activities.';
  }
}
