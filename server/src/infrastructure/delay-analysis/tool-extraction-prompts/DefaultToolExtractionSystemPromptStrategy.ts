import type { IToolExtractionSystemPromptStrategy } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import { renderDelayEventOutputFormatBlock } from '../../../domain/delay-analysis/DelayEventExtractionContract';

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

${renderDelayEventOutputFormatBlock()}`;
  }

  buildUserPromptSuffix(): string {
    return 'Extract all contractor-caused delay events from this document. Use the schedule lookup tool to find matching activities.';
  }
}
