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
import type { IToolExtractionSystemPromptStrategyFactory } from '../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import { DocumentExtractionStrategyFactory } from './extraction-strategies/DocumentExtractionStrategyFactory';
import { OPENAI_MODELS } from '../../domain/value-objects/ModelId';
import OpenAI from 'openai';

const TOOL_EXTRACTION_MODEL = OPENAI_MODELS['gpt-5.2'];

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
  delayEventConfidence?: number;
}

export class AIDelayEventExtractorWithTools implements IDelayEventExtractor {
  private readonly strategyFactory: IDocumentExtractionStrategyFactory;
  private readonly systemPromptStrategyFactory: IToolExtractionSystemPromptStrategyFactory;
  private readonly openai: OpenAI | null;

  constructor(
    private readonly toolExecutor: IExtractionToolExecutor,
    systemPromptStrategyFactory: IToolExtractionSystemPromptStrategyFactory,
    apiKey?: string,
    strategyFactory?: IDocumentExtractionStrategyFactory
  ) {
    this.systemPromptStrategyFactory = systemPromptStrategyFactory;
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
    
    console.log(`[Knowledge Base] skipKnowledgeBase=true for strategy prompt (KB already in system prompt for tool-based extraction)`);
    const strategyResult = strategy.buildExtractionPrompt({
      documentContent,
      documentFilename,
      documentId,
      documentType,
      skipKnowledgeBase: true,
    });

    const fieldMemoContextBlock = options?.fieldMemoContext
      ? `\n--- FIELD MEMO CONTEXT (Background Information) ---
The following is a summary of Field Memos from this project. Use this context to better understand ongoing site conditions, corrective actions, and known issues when evaluating potential delay events.

${options.fieldMemoContext}
--- END FIELD MEMO CONTEXT ---\n`
      : '';

    const systemPromptStrategy = this.systemPromptStrategyFactory.getStrategy(documentType);
    console.log(`[AI] TOOL-EXTRACTION: Using system prompt strategy: ${systemPromptStrategy.strategyName} (type: ${documentType})`);

    const userPrompt = `Analyze the following ${documentType.toUpperCase()} document and extract all contractor-caused delay events.

Document Filename: ${documentFilename}
Document ID: ${documentId}
${fieldMemoContextBlock}
--- DOCUMENT CONTENT ---
${documentContent}
--- END DOCUMENT ---

${strategyResult.prompt}

${systemPromptStrategy.buildUserPromptSuffix()}`;

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
        { role: 'system', content: systemPromptStrategy.buildSystemPrompt() },
        { role: 'user', content: userPrompt }
      ];

      let continueLoop = true;
      let finalContent = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════════╗');
      console.log('║  TOOL-BASED EXTRACTION ACTIVE - Real-time schedule lookup enabled ║');
      console.log('╚══════════════════════════════════════════════════════════════════╝');
      console.log(`[AI] TOOL-EXTRACTION: Starting for "${documentFilename}" (type: ${documentType})`);
      console.log(`[AI] TOOL-EXTRACTION: AI can query schedule database during extraction for accurate matching`);
      console.log('');
      
      while (continueLoop) {
        console.log(`[AI] TOOL-EXTRACTION: Calling OpenAI API with function calling enabled...`);
        
        const response = await this.openai.chat.completions.create({
          model: TOOL_EXTRACTION_MODEL,
          messages,
          tools,
          max_completion_tokens: 4000,
          temperature: 0,
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
            console.log('');
            console.log(`[AI] TOOL-EXTRACTION: >>>>>> SCHEDULE DATABASE LOOKUP <<<<<<`);
            console.log(`[AI] TOOL-EXTRACTION: AI is querying schedule for ${activityIds.length} activity IDs:`);
            activityIds.forEach(id => console.log(`[AI] TOOL-EXTRACTION:   - ${id}`));

            const toolResult = await this.toolExecutor.execute({
              tenantId: options.tenantId,
              projectId: options.projectId,
              activityIds,
            });

            console.log(`[AI] TOOL-EXTRACTION: Database returned: ${toolResult.found.length} found, ${toolResult.notFound.length} not found`);
            if (toolResult.found.length > 0) {
              console.log(`[AI] TOOL-EXTRACTION: Found activities:`);
              toolResult.found.forEach(a => console.log(`[AI] TOOL-EXTRACTION:   ✓ ${a.activityId}: ${a.activityDescription}`));
            }
            if (toolResult.notFound.length > 0) {
              console.log(`[AI] TOOL-EXTRACTION: Not found in schedule:`);
              toolResult.notFound.forEach(id => console.log(`[AI] TOOL-EXTRACTION:   ✗ ${id}`));
            }
            console.log('');

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
          model: TOOL_EXTRACTION_MODEL,
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

      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════════╗');
      console.log('║  TOOL-BASED EXTRACTION COMPLETED                                  ║');
      console.log('╚══════════════════════════════════════════════════════════════════╝');
      console.log(`[AI] TOOL-EXTRACTION: Document: "${documentFilename}"`);
      console.log(`[AI] TOOL-EXTRACTION: Tokens used: ${totalInputTokens} input + ${totalOutputTokens} output`);
      console.log(`[AI] TOOL-EXTRACTION: Events extracted: ${parseResult.events.length}`);
      const matchedCount = parseResult.events.filter(e => e.matchedActivityId).length;
      console.log(`[AI] TOOL-EXTRACTION: Pre-matched to activities: ${matchedCount}/${parseResult.events.length}`);
      if (matchedCount > 0) {
        parseResult.events.filter(e => e.matchedActivityId).forEach(e => {
          console.log(`[AI] TOOL-EXTRACTION:   ✓ "${e.eventDescription?.substring(0, 50)}..." -> ${e.matchedActivityId}`);
        });
      }
      console.log('');

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

      const arrayStartIndex = cleanedResponse.indexOf('[');
      const objectStartIndex = cleanedResponse.indexOf('{');

      if (objectStartIndex === -1 && arrayStartIndex === -1) {
        console.warn('[AIDelayEventExtractorWithTools] No JSON object or array found in response');
        return { events: [] };
      }

      let parsed: Record<string, unknown>;

      if (arrayStartIndex !== -1 && (objectStartIndex === -1 || arrayStartIndex < objectStartIndex)) {
        console.log('[AIDelayEventExtractorWithTools] Response is a top-level JSON array — wrapping as {delayEvents: [...]}');
        let bracketCount = 0;
        let arrayEndIndex = arrayStartIndex;
        for (let i = arrayStartIndex; i < cleanedResponse.length; i++) {
          if (cleanedResponse[i] === '[') bracketCount++;
          if (cleanedResponse[i] === ']') bracketCount--;
          if (bracketCount === 0) {
            arrayEndIndex = i + 1;
            break;
          }
        }
        const arrayStr = cleanedResponse.substring(arrayStartIndex, arrayEndIndex);
        parsed = { delayEvents: JSON.parse(arrayStr) };
      } else {
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
        parsed = JSON.parse(objectStr);
      }

      let workActivities: IDRWorkActivity[] | undefined;
      if (parsed.workActivities && Array.isArray(parsed.workActivities)) {
        workActivities = (parsed.workActivities as Array<{ activityId?: string; description?: string; comments?: string }>)
          .filter((wa) => wa.activityId && wa.activityId.trim().length > 0)
          .map((wa) => ({
            activityId: String(wa.activityId || '').trim(),
            description: String(wa.description || '').trim(),
            comments: wa.comments ? String(wa.comments).trim() : undefined,
          }));
      }

      const eventsArray = (parsed.delayEvents || parsed.events || []) as ExtractedEventRaw[];
      const events: ExtractedDelayEvent[] = eventsArray
        .map((item: ExtractedEventRaw) => this.mapToDelayEvent(item, baseConfidence, documentType))
        .filter((e: ExtractedDelayEvent) => e.eventDescription.length > 0)
        .filter((e: ExtractedDelayEvent) => {
          if (e.delayEventConfidence !== null && e.delayEventConfidence !== undefined && e.delayEventConfidence < 0.10) {
            console.log(`[AIDelayEventExtractorWithTools] Dropping low-confidence event (${e.delayEventConfidence}): ${e.eventDescription.substring(0, 80)}`);
            return false;
          }
          return true;
        });

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
      const rawDuration = item.impactDurationHours;
      console.log(`[AI] TOOL-EXTRACTION: Raw impactDurationHours from AI: ${JSON.stringify(rawDuration)} (type: ${typeof rawDuration})`);
      impactDurationHours = typeof rawDuration === 'number'
        ? rawDuration
        : this.parseNumber(rawDuration);
      if (impactDurationHours !== null) {
        console.log(`[AI] TOOL-EXTRACTION: Parsed duration: ${impactDurationHours}h`);
      }
    }

    return {
      eventDescription: String(item.eventDescription || item.description || ''),
      eventCategory: this.parseCategory(item.eventCategory || item.category),
      eventDate: this.parseDate(item.eventDate || item.date),
      impactDurationHours,
      sourceReference: String(item.sourceReference || item.source || ''),
      extractedFromCode: String(item.extractedFromCode || item.code || 'GENERAL'),
      confidenceScore: this.parseConfidenceScore(item.confidenceScore, baseConfidence),
      delayEventConfidence: this.parseConfidenceScore(item.delayEventConfidence, baseConfidence),
      responsibilityConfirmed: typeof item.responsibilityConfirmed === 'boolean'
        ? item.responsibilityConfirmed
        : undefined,
      reworkDescription: item.reworkDescription
        ? String(item.reworkDescription)
        : undefined,
      matchedActivityId: this.sanitizeActivityId(item.matchedActivityId),
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

  private sanitizeActivityId(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    
    const strValue = String(value).trim().toUpperCase();
    
    const invalidValues = ['NA', 'N/A', 'NULL', 'NONE', 'UNKNOWN', '-', ''];
    if (invalidValues.includes(strValue)) {
      console.log(`[AI] TOOL-EXTRACTION: Sanitized invalid matchedActivityId "${value}" -> undefined`);
      return undefined;
    }
    
    return String(value).trim() || undefined;
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

  private parseNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
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
