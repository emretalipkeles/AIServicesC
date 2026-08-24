import type { IDelayEventExtractor, ExtractionResult, ExtractedDelayEvent, ExtractionOptions } from '../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { DelayEventCategory } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { IDocumentExtractionStrategyFactory } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategyFactory';
import type { IDRWorkActivity } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';
import { DocumentExtractionStrategyFactory } from './extraction-strategies/DocumentExtractionStrategyFactory';
import { auditNarrativeProvenance } from './NarrativeProvenanceCheck';
import { normalizeClockTime, normalizeDurationBasis } from '../../domain/delay-analysis/DurationProvenance';
import { AIResponseTruncatedError, AIResponseSchemaViolationError } from '../../domain/errors/DomainError';
import {
  delayExtractionResponseSchema,
  normalizeDelayExtractionResponse,
  type RawExtractedDelayEvent,
} from '../../domain/delay-analysis/DelayEventExtractionContract';

export class AIDelayEventExtractor implements IDelayEventExtractor {
  private readonly strategyFactory: IDocumentExtractionStrategyFactory;

  constructor(
    private readonly aiClient: IAIClient,
    strategyFactory?: IDocumentExtractionStrategyFactory
  ) {
    this.strategyFactory = strategyFactory ?? new DocumentExtractionStrategyFactory();
  }

  async extractDelayEvents(
    documentContent: string,
    documentFilename: string,
    documentId: string,
    options?: ExtractionOptions
  ): Promise<ExtractionResult> {
    const documentType = options?.documentType ?? 'other';
    const strategy = this.strategyFactory.getStrategy(documentType);
    
    const strategyResult = strategy.buildExtractionPrompt({
      documentContent,
      documentFilename,
      documentId,
      documentType,
      fieldMemoContext: options?.fieldMemoContext,
    });

    try {
      console.log(`[AI] EXTRACTION: Starting delay event extraction for "${documentFilename}" (type: ${documentType}, strategy: ${strategy.strategyName})`);
      
      // temperature is omitted: this always routes to the gpt-5.4 reasoning
      // deployment, which rejects non-default temperature once reasoning_effort is
      // set (OpenAIResponsesClient sends reasoning_effort on every request).
      const response = await this.aiClient.chat({
        model: ModelId.gpt54(),
        messages: [AIMessage.user(strategyResult.prompt)],
        maxTokens: 16000,
      });
      
      console.log(`[AI] EXTRACTION: Completed - used ${response.inputTokens} input + ${response.outputTokens} output tokens`);

      if (options?.onTokenUsage && options?.runId) {
        await options.onTokenUsage({
          runId: options.runId,
          operation: 'delay_event_extraction',
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          metadata: { 
            documentFilename, 
            documentId,
            documentType,
            strategyUsed: strategy.strategyName,
          },
        });
      }

      const parseResult = this.parseExtractionResponse(
        response.content, 
        strategyResult.baseConfidence, 
        documentType,
        documentFilename
      );

      if (parseResult.workActivities && parseResult.workActivities.length > 0) {
        console.log(`[AIDelayEventExtractor] Extracted ${parseResult.workActivities.length} work activities from ${documentFilename}`);
      }

      auditNarrativeProvenance(
        '[AIDelayEventExtractor]',
        documentType,
        documentFilename,
        documentContent,
        parseResult.events
      );

      return {
        events: parseResult.events,
        documentId,
        totalEventsFound: parseResult.events.length,
        strategyUsed: strategy.strategyName,
        baseConfidence: strategyResult.baseConfidence,
        delayIsCertain: strategyResult.delayIsCertain,
        workActivities: parseResult.workActivities,
      };
    } catch (error) {
      if (error instanceof AIResponseTruncatedError || error instanceof AIResponseSchemaViolationError) {
        // Don't let a truncated or contract-violating response degrade into an empty event
        // list that looks identical to a genuine "no delays found" result — surface it as
        // a failure.
        console.error(`[AIDelayEventExtractor] ${error.constructor.name}:`, error.message);
        throw error;
      }
      console.error('Error extracting delay events:', error);
      return {
        events: [],
        documentId,
        totalEventsFound: 0,
        strategyUsed: strategy.strategyName,
        baseConfidence: strategyResult.baseConfidence,
        delayIsCertain: strategyResult.delayIsCertain,
      };
    }
  }

  /**
   * Parses and validates the model's response against the shared delay-event extraction
   * contract (DelayEventExtractionContract.ts) — the same contract AIDelayEventExtractorWithTools
   * enforces. This extractor is not wired into bootstrap.ts (AIDelayEventExtractorWithTools is
   * the production path) and so cannot set response_format, but its parser still validates
   * against the same schema and fails loudly on a violation rather than silently degrading.
   */
  private parseExtractionResponse(
    response: string,
    baseConfidence: number,
    documentType: string,
    documentFilename: string
  ): { events: ExtractedDelayEvent[]; workActivities?: IDRWorkActivity[] } {
    const context = `AIDelayEventExtractor.parseExtractionResponse (${documentFilename})`;
    const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleanedResponse = (jsonBlockMatch ? jsonBlockMatch[1] : response).trim();

    if (cleanedResponse.length === 0) {
      throw new AIResponseSchemaViolationError(context, 'response was empty');
    }

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(cleanedResponse);
    } catch (error) {
      throw new AIResponseSchemaViolationError(
        context,
        `response was not valid JSON (${error instanceof Error ? error.message : 'unknown parse error'})`
      );
    }

    const validation = delayExtractionResponseSchema.safeParse(rawParsed);
    if (!validation.success) {
      throw new AIResponseSchemaViolationError(context, validation.error.message);
    }

    const { rawEvents, rawWorkActivities } = normalizeDelayExtractionResponse(validation.data);

    const workActivities: IDRWorkActivity[] | undefined = rawWorkActivities.length > 0
      ? rawWorkActivities
          .filter((wa) => wa.activityId && wa.activityId.trim().length > 0)
          .map((wa) => ({
            activityId: String(wa.activityId || '').trim(),
            description: String(wa.description || '').trim(),
            comments: wa.comments ? String(wa.comments).trim() : undefined,
          }))
      : undefined;

    const events = rawEvents.map((item: RawExtractedDelayEvent) => {
      let impactDurationHours: number | null = null;

      if (documentType === 'ncr') {
        impactDurationHours = null;
      } else {
        impactDurationHours = typeof item.impactDurationHours === 'number'
          ? item.impactDurationHours
          : this.parseNumber(item.impactDurationHours);
      }

      return {
        eventDescription: String(item.eventDescription || item.description || ''),
        eventCategory: this.parseCategory(item.eventCategory || item.category),
        eventDate: this.parseDate(item.eventDate || item.date),
        impactDurationHours,
        impactedWindowStart: normalizeClockTime(item.impactedWindowStart),
        impactedWindowEnd: normalizeClockTime(item.impactedWindowEnd),
        durationBasis: normalizeDurationBasis(item.durationBasis),
        fallbackEstimateHours: typeof item.fallbackEstimateHours === 'number'
          ? item.fallbackEstimateHours
          : this.parseNumber(item.fallbackEstimateHours),
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
      };
    }).filter((e: ExtractedDelayEvent) => e.eventDescription.length > 0)
      .filter((e: ExtractedDelayEvent) => {
        if (e.delayEventConfidence !== null && e.delayEventConfidence !== undefined && e.delayEventConfidence < 0.10) {
          console.log(`[AIDelayEventExtractor] Dropping low-confidence event (${e.delayEventConfidence}): ${e.eventDescription.substring(0, 80)}`);
          return false;
        }
        return true;
      });

    return { events, workActivities };
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
