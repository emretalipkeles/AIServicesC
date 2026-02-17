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
import type { ProjectDocumentType } from '../../domain/delay-analysis/entities/ProjectDocument';
import { DocumentExtractionStrategyFactory } from './extraction-strategies/DocumentExtractionStrategyFactory';
import { ContractorDelayTrainingGuide } from '../../domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from './DelayKnowledgePromptBuilder';
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

const knowledgeBaseInstance = new ContractorDelayTrainingGuide();
const knowledgePromptBuilder = new DelayKnowledgePromptBuilder(knowledgeBaseInstance);

function buildToolEnabledSystemPrompt(documentType: ProjectDocumentType): string {
  console.log(`[Knowledge Base] Building SYSTEM PROMPT knowledge base for tool-based extractor (document type: ${documentType})`);
  const knowledgeBaseContent = knowledgePromptBuilder.buildPromptForDocumentType(documentType);

  return `You are a construction delay analysis expert. Your task is to extract contractor-caused delay events from construction documents and match them to schedule activities.

${knowledgeBaseContent}

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
      "impactDurationHours": number (REQUIRED - always estimate hours even if not explicit),
      "sourceReference": "Include DSC/NCR/RFI number if mentioned (e.g., 'DSC 293', 'NCR-045') AND page/section reference",
      "extractedFromCode": "code tag if applicable",
      "confidenceScore": 0.0-1.0,
      "delayEventConfidence": 0.0-1.0,
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

## DIARY SECTION - DO NOT SKIP:
IDRs contain "Diary" sections with timestamped narratives. These are CRITICAL delay sources - do NOT skip them while focusing on DSC entries.

**EXTRACT DELAYS FROM BOTH:**
1. DSC/CODE_CIE entries (discrepancies, contractor issues)
2. Diary narrative entries (timestamped observations throughout the day)

**DIARY DURATION CALCULATION:**
When diary shows work stopped and resumed, calculate duration from timestamps:
- Time formats: 0700, 07:00, 7:00, 7am, 7:00 AM, 0700hrs
- Example: "0700 - machine not working" ... "0830 - resumed" = 1.5 hours delay

**SOURCE REFERENCE FOR DIARY:**
Include timestamp: "Diary, 1415: excavation stopped due to tree roots" or "Diary 0800-0930: crew idle"

## CRITICAL - DURATION IS REQUIRED:
You MUST provide impactDurationHours for EVERY delay event. Never leave it null or omit it.

**HOW TO ESTIMATE DURATION:**
1. If explicitly stated (e.g., "1.5 hour", "2 hours"): use that value
2. If timestamps show start/end (e.g., "0700 stopped" ... "0830 resumed"): calculate the difference (1.5h)
3. If waiting for direction/decision: estimate based on typical response times (often 2-4 hours or more)
4. If rework/correction needed: estimate based on scope (typically 1-4 hours)
5. If no clear indication: use reasonable estimate based on the nature of the delay (minimum 0.5h)

Examples:
- "CDF removal took 1.5 hours" → impactDurationHours: 1.5
- "0800 stopped, 0930 resumed" → impactDurationHours: 1.5
- "Waiting on SPU direction" (no resolution noted) → impactDurationHours: 2 (or more based on context)
- "Large roots encountered, excavation stopped" → impactDurationHours: 1 (estimate)
`;
}


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
        { role: 'system', content: buildToolEnabledSystemPrompt(documentType) },
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
