import type { 
  IDelayEventExtractor, 
  ExtractionResult, 
  ExtractedDelayEvent, 
  ExtractionOptions 
} from '../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { DelayEventCategory } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { IDocumentExtractionStrategyFactory } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategyFactory';
import type { IDRWorkActivity } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { IExtractionToolExecutor } from '../../domain/delay-analysis/interfaces/IExtractionToolExecutor';
import { DocumentExtractionStrategyFactory } from './extraction-strategies/DocumentExtractionStrategyFactory';
import OpenAI from 'openai';

export interface ExtractionWithToolsOptions extends ExtractionOptions {
  tenantId: string;
  projectId: string;
}

interface ExtractedEventRaw {
  eventDescription?: string;
  description?: string;
  eventCategory?: string;
  category?: string;
  eventDate?: string;
  date?: string;
  impactDurationHours?: number;
  sourceReference?: string;
  source?: string;
  extractedFromCode?: string;
  code?: string;
  confidenceScore?: number;
  responsibilityConfirmed?: boolean;
  reworkDescription?: string;
  matchedActivityId?: string;
  matchedActivityDescription?: string;
  matchedActivityWbs?: string;
  matchConfidence?: number;
  matchReasoning?: string;
}

const TOOL_ENABLED_SYSTEM_PROMPT = `You are a construction delay analysis expert. Your task is to extract contractor-caused delay events from construction documents and match them to schedule activities.

## CRITICAL FIRST STEP - FIND ACTIVITY IDs:

**BEFORE extracting any delay events, you MUST scan the document for the "Contractor's Work Activity" table or similar sections that list schedule activity IDs.**

In Inspector's Daily Reports (IDRs), look for tables with columns like:
- "Schedule Activity #" or "Activity #" (e.g., "2-W-0471", "3-W-1042", "4-PF-1526")
- "Description" (e.g., "Stage 1 WM: Excavate Services")
- "Comments" (e.g., "WM STA 7+00 to 21+50")

These activity IDs tell you EXACTLY which CPM schedule activities the contractor was working on that day.

## EXTRACTION WORKFLOW:

1. **FIRST: Find the "Contractor's Work Activity" table** - Extract ALL activity IDs listed (format: X-XX-XXXX like "2-W-0471", "3-W-1042")
2. **IMMEDIATELY use the get_schedule_activities tool** to look up these IDs in the project schedule database
3. **Extract delay events** from the document (diary entries, discrepancies, extra work, etc.)
4. **Match each delay to the most relevant activity** from the tool results - the activities listed in the document are what was being worked on, so delays likely affect those specific activities
5. **Output the final JSON** with delay events and their matched activities

## ACTIVITY ID PATTERNS TO DETECT:
- IDR format: "X-XX-XXXX" (e.g., "2-W-0471", "3-W-1042", "4-PF-1526", "1-ST-0089")
- Also: "Activity 1234", "Activity ID: XXX", "WBS XX.XX.XX"
- Call the tool with ALL detected IDs at once for efficiency

## OUTPUT FORMAT:
Return a JSON object with the structure:
{
  "delayEvents": [
    {
      "eventDescription": "Clear description of what caused the delay",
      "eventCategory": "one of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other",
      "eventDate": "YYYY-MM-DD",
      "impactDurationHours": number or null,
      "sourceReference": "Include DSC/NCR/RFI number if mentioned (e.g., 'DSC 293', 'NCR-045') AND page/section reference",
      "extractedFromCode": "code tag if applicable",
      "confidenceScore": 0.0-1.0,
      "responsibilityConfirmed": true/false,
      "matchedActivityId": "activity ID if matched" or null,
      "matchedActivityDescription": "description of matched activity from tool results" or null,
      "matchedActivityWbs": "WBS code of matched activity" or null,
      "matchConfidence": 0.0-1.0 if matched or null,
      "matchReasoning": "brief explanation of why this activity matches" or null
    }
  ],
  "workActivities": [
    {"activityId": "XXX", "description": "...", "comments": "..."}
  ]
}

## MATCHING RULES:
- **Priority: Match to activities from the document's "Contractor's Work Activity" table** - these are the activities being worked on when the delay occurred
- If a delay clearly relates to work described in the activity table (e.g., excavation delay matches "Excavate Services" activity), match with HIGH confidence (90%+)
- Use tool results to get full activity descriptions and verify IDs exist in the schedule
- Only set matchedActivityId if you are 70%+ confident the delay affects that specific activity
- If an activity ID was mentioned in the document but not found in the schedule database, still include it with a note in matchReasoning
`;

export class AIDelayEventExtractorWithTools implements IDelayEventExtractor {
  private readonly strategyFactory: IDocumentExtractionStrategyFactory;
  private readonly openai: OpenAI | null;

  constructor(
    private readonly toolExecutor: IExtractionToolExecutor,
    apiKey?: string,
    strategyFactory?: IDocumentExtractionStrategyFactory
  ) {
    this.strategyFactory = strategyFactory ?? new DocumentExtractionStrategyFactory();
    const key = apiKey || process.env.OPEN_AI_KEY;
    this.openai = key ? new OpenAI({ apiKey: key }) : null;
  }

  async extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    if (options?.enableToolBasedMatching && options?.tenantId && options?.projectId) {
      return this.extractDelayEventsWithTools(documentContent, documentFilename, documentId, {
        ...options,
        tenantId: options.tenantId,
        projectId: options.projectId,
      });
    }
    throw new Error(
      'AIDelayEventExtractorWithTools requires tenantId and projectId in options with enableToolBasedMatching=true. ' +
      'Use the standard AIDelayEventExtractor for simple extraction without tools.',
    );
  }

  async extractDelayEventsWithTools(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options: ExtractionWithToolsOptions
  ): Promise<ExtractionResult> {
    if (!this.openai) {
      console.error('[AIDelayEventExtractorWithTools] OpenAI API key not configured');
      return {
        events: [],
        documentId,
        totalEventsFound: 0,
      };
    }

    const documentType = options?.documentType ?? 'other';
    const strategy = this.strategyFactory.getStrategy(documentType);
    
    const strategyResult = strategy.buildExtractionPrompt({
      documentContent,
      documentFilename,
      documentId,
      documentType,
    });

    const userPrompt = `Analyze the following ${documentType.toUpperCase()} document and extract all contractor-caused delay events.

Document Filename: ${documentFilename}
Document ID: ${documentId}

--- DOCUMENT CONTENT ---
${documentContent}
--- END DOCUMENT ---

${strategyResult.prompt}

Remember: First scan for activity IDs and use the tool to look them up, then extract and match delay events.`;

    const tools: OpenAI.ChatCompletionTool[] = [
      {
        type: 'function',
        function: {
          name: this.toolExecutor.toolName,
          description: this.toolExecutor.getToolDefinition().description,
          parameters: this.toolExecutor.getToolDefinition().parameters as OpenAI.FunctionParameters,
        }
      }
    ];

    try {
      let messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: TOOL_ENABLED_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ];

      let continueLoop = true;
      let finalContent = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      console.log(`[AI] TOOL-EXTRACTION: Starting tool-based extraction for "${documentFilename}" (type: ${documentType})`);
      
      while (continueLoop) {
        console.log(`[AI] TOOL-EXTRACTION: Calling OpenAI API...`);
        
        const response = await this.openai.chat.completions.create({
          model: 'gpt-4.1',
          messages,
          tools,
          max_tokens: 4000,
          temperature: 0.1,
        });

        const choice = response.choices[0];
        totalInputTokens += response.usage?.prompt_tokens ?? 0;
        totalOutputTokens += response.usage?.completion_tokens ?? 0;

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          messages.push({
            role: 'assistant',
            content: choice.message.content,
            tool_calls: choice.message.tool_calls,
          });

          for (const toolCall of choice.message.tool_calls) {
            if (toolCall.type !== 'function') continue;
            
            console.log(`[AI] TOOL-EXTRACTION: AI requested tool call: ${toolCall.function.name}`);
            
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(toolCall.function.arguments);
            } catch {
              console.error('[AIDelayEventExtractorWithTools] Failed to parse tool arguments');
              args = { activity_ids: [] };
            }

            const activityIds = (args.activity_ids as string[]) || [];
            console.log(`[AI] TOOL-EXTRACTION: Looking up ${activityIds.length} activity IDs in schedule:`, activityIds);

            const toolResult = await this.toolExecutor.execute({
              tenantId: options.tenantId,
              projectId: options.projectId,
              activityIds,
            });

            const toolResultContent = {
              found: toolResult.found.map(a => ({
                activityId: a.activityId,
                description: a.activityDescription,
                wbs: a.wbs,
                isCriticalPath: a.isCriticalPath,
                plannedStart: a.plannedStartDate ? a.plannedStartDate.toISOString().split('T')[0] : null,
                plannedFinish: a.plannedFinishDate ? a.plannedFinishDate.toISOString().split('T')[0] : null,
              })),
              notFound: toolResult.notFound,
            };

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResultContent),
            });
          }
        } else {
          finalContent = choice.message.content || '';
          continueLoop = false;
        }
      }

      if (options?.onTokenUsage && options?.runId) {
        await options.onTokenUsage({
          runId: options.runId,
          operation: 'delay_event_extraction_with_tools',
          model: 'gpt-4.1',
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          metadata: {
            documentFilename,
            documentId,
            documentType,
            strategyUsed: strategy.strategyName,
            toolEnabled: true,
          },
        });
      }

      const parseResult = this.parseExtractionResponse(
        finalContent,
        strategyResult.baseConfidence,
        documentType
      );

      console.log(`[AI] TOOL-EXTRACTION: Completed - used ${totalInputTokens} input + ${totalOutputTokens} output tokens`);
      console.log(`[AI] TOOL-EXTRACTION: Extracted ${parseResult.events.length} events from "${documentFilename}"`);
      const matchedCount = parseResult.events.filter(e => e.matchedActivityId).length;
      console.log(`[AI] TOOL-EXTRACTION: ${matchedCount}/${parseResult.events.length} events have pre-matched activity IDs`);

      return {
        events: parseResult.events,
        documentId,
        totalEventsFound: parseResult.events.length,
        strategyUsed: strategy.strategyName + '_with_tools',
        baseConfidence: strategyResult.baseConfidence,
        delayIsCertain: strategyResult.delayIsCertain,
        workActivities: parseResult.workActivities,
      };
    } catch (error) {
      console.error('[AIDelayEventExtractorWithTools] Error extracting delay events:', error);
      return {
        events: [],
        documentId,
        totalEventsFound: 0,
        strategyUsed: strategy.strategyName + '_with_tools',
        baseConfidence: strategyResult.baseConfidence,
        delayIsCertain: strategyResult.delayIsCertain,
      };
    }
  }

  private parseExtractionResponse(
    response: string,
    baseConfidence: number,
    documentType: string
  ): { events: ExtractedDelayEvent[]; workActivities?: IDRWorkActivity[] } {
    try {
      const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      const cleanedResponse = jsonBlockMatch ? jsonBlockMatch[1].trim() : response;

      const objectStartIndex = cleanedResponse.indexOf('{');
      if (objectStartIndex === -1) {
        console.warn('[AIDelayEventExtractorWithTools] No JSON object found in response');
        return { events: [] };
      }

      let braceCount = 0;
      let objectEndIndex = objectStartIndex;
      for (let i = objectStartIndex; i < cleanedResponse.length; i++) {
        if (cleanedResponse[i] === '{') braceCount++;
        if (cleanedResponse[i] === '}') braceCount--;
        if (braceCount === 0) {
          objectEndIndex = i + 1;
          break;
        }
      }

      const objectStr = cleanedResponse.substring(objectStartIndex, objectEndIndex);
      const parsed = JSON.parse(objectStr);

      let workActivities: IDRWorkActivity[] | undefined;
      if (parsed.workActivities && Array.isArray(parsed.workActivities)) {
        workActivities = parsed.workActivities
          .filter((wa: { activityId?: string }) => wa.activityId && wa.activityId.trim().length > 0)
          .map((wa: { activityId?: string; description?: string; comments?: string }) => ({
            activityId: String(wa.activityId || '').trim(),
            description: String(wa.description || '').trim(),
            comments: wa.comments ? String(wa.comments).trim() : undefined,
          }));
      }

      const eventsArray = parsed.delayEvents || parsed.events || [];
      const events: ExtractedDelayEvent[] = eventsArray
        .map((item: ExtractedEventRaw) => this.mapToDelayEvent(item, baseConfidence, documentType))
        .filter((e: ExtractedDelayEvent) => e.eventDescription.length > 0);

      return { events, workActivities };
    } catch (error) {
      console.error('[AIDelayEventExtractorWithTools] Error parsing response:', error);
      return { events: [] };
    }
  }

  private mapToDelayEvent(
    item: ExtractedEventRaw,
    baseConfidence: number,
    documentType: string
  ): ExtractedDelayEvent {
    let impactDurationHours: number | null = null;
    if (documentType !== 'ncr') {
      impactDurationHours = typeof item.impactDurationHours === 'number'
        ? item.impactDurationHours
        : null;
    }

    return {
      eventDescription: String(item.eventDescription || item.description || ''),
      eventCategory: this.parseCategory(item.eventCategory || item.category),
      eventDate: this.parseDate(item.eventDate || item.date),
      impactDurationHours,
      sourceReference: String(item.sourceReference || item.source || ''),
      extractedFromCode: String(item.extractedFromCode || item.code || 'GENERAL'),
      confidenceScore: this.parseConfidenceScore(item.confidenceScore, baseConfidence),
      responsibilityConfirmed: typeof item.responsibilityConfirmed === 'boolean'
        ? item.responsibilityConfirmed
        : undefined,
      reworkDescription: item.reworkDescription
        ? String(item.reworkDescription)
        : undefined,
      matchedActivityId: item.matchedActivityId || undefined,
      matchedActivityDescription: item.matchedActivityDescription || undefined,
      matchedActivityWbs: item.matchedActivityWbs || undefined,
      matchConfidence: this.normalizeMatchConfidence(item.matchConfidence),
      matchReasoning: item.matchReasoning || undefined,
    };
  }

  private normalizeMatchConfidence(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    
    if (typeof value === 'number') {
      if (value >= 0 && value <= 1) {
        return value;
      }
      if (value >= 0 && value <= 100) {
        return value / 100;
      }
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        if (parsed >= 0 && parsed <= 1) return parsed;
        if (parsed >= 0 && parsed <= 100) return parsed / 100;
      }
    }
    return undefined;
  }

  private parseConfidenceScore(value: unknown, baseConfidence: number): number {
    if (typeof value === 'number' && value >= 0 && value <= 1) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return baseConfidence;
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
