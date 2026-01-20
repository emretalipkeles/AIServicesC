import type { IDelayEventExtractor, ExtractionResult, ExtractedDelayEvent, ExtractionOptions } from '../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { DelayEventCategory } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';

const EXTRACTION_PROMPT = `You are an expert construction delay analyst. Analyze the following Inspector Daily Report (IDR) and extract any contractor-caused delay events.

Look specifically for:
1. CODE_CIE tags or entries (Contractor Initiated Events)
2. Delays caused by contractor actions or inaction
3. Work stoppages due to contractor issues
4. Material or equipment delays from contractor
5. Subcontractor coordination failures
6. Quality issues requiring rework

For each delay event found, extract:
- eventDescription: Clear description of the delay event
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other
- eventDate: The date of the event if mentioned (YYYY-MM-DD format)
- impactDurationHours: Estimated hours of impact if mentioned
- sourceReference: The section/paragraph where this was found
- extractedFromCode: The exact CODE_CIE or delay code if present

Return a JSON array of extracted events. If no delays are found, return an empty array.

Document content:
`;

export class AIDelayEventExtractor implements IDelayEventExtractor {
  constructor(private readonly aiClient: IAIClient) {}

  async extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    const truncatedContent = documentContent.slice(0, 30000);
    
    const prompt = EXTRACTION_PROMPT + truncatedContent;

    try {
      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 4000,
        temperature: 0.1,
      });

      if (options?.onTokenUsage && options?.runId) {
        await options.onTokenUsage({
          runId: options.runId,
          operation: 'delay_event_extraction',
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          metadata: { documentFilename, documentId },
        });
      }

      const events = this.parseExtractionResponse(response.content);

      return {
        events,
        documentId,
        totalEventsFound: events.length,
      };
    } catch (error) {
      console.error('Error extracting delay events:', error);
      return {
        events: [],
        documentId,
        totalEventsFound: 0,
      };
    }
  }

  private parseExtractionResponse(response: string): ExtractedDelayEvent[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((item: Record<string, unknown>) => ({
        eventDescription: String(item.eventDescription || item.description || ''),
        eventCategory: this.parseCategory(item.eventCategory || item.category),
        eventDate: this.parseDate(item.eventDate || item.date),
        impactDurationHours: typeof item.impactDurationHours === 'number' 
          ? item.impactDurationHours 
          : null,
        sourceReference: String(item.sourceReference || item.source || ''),
        extractedFromCode: String(item.extractedFromCode || item.code || 'CODE_CIE'),
      })).filter((e: ExtractedDelayEvent) => e.eventDescription.length > 0);
    } catch (error) {
      console.error('Error parsing extraction response:', error);
      return [];
    }
  }

  private parseCategory(value: unknown): DelayEventCategory | null {
    const validCategories: DelayEventCategory[] = [
      'planning_mobilization',
      'labor_related',
      'materials_equipment',
      'subcontractor_coordination',
      'quality_rework',
      'site_management_safety',
      'utility_infrastructure',
      'other',
    ];

    if (typeof value === 'string' && validCategories.includes(value as DelayEventCategory)) {
      return value as DelayEventCategory;
    }

    return null;
  }

  private parseDate(value: unknown): Date | null {
    if (!value) return null;
    
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }
}
