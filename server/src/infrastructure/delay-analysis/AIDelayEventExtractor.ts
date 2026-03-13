import type { IDelayEventExtractor, ExtractionResult, ExtractedDelayEvent, ExtractionOptions } from '../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { DelayEventCategory } from '../../domain/delay-analysis/entities/ContractorDelayEvent';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { IDocumentExtractionStrategyFactory } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategyFactory';
import type { IDRWorkActivity } from '../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { ModelId } from '../../domain/value-objects/ModelId';
import { DocumentExtractionStrategyFactory } from './extraction-strategies/DocumentExtractionStrategyFactory';

interface IDRExtractionResponse {
  workActivities?: Array<{
    activityId?: string;
    description?: string;
    comments?: string;
  }>;
  delayEvents?: Array<Record<string, unknown>>;
}

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
      
      const response = await this.aiClient.chat({
        model: ModelId.gpt52(),
        messages: [AIMessage.user(strategyResult.prompt)],
        maxTokens: 4000,
        temperature: 0,
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
        strategyResult.extractWorkActivities ?? false
      );

      if (parseResult.workActivities && parseResult.workActivities.length > 0) {
        console.log(`[AIDelayEventExtractor] Extracted ${parseResult.workActivities.length} work activities from ${documentFilename}`);
      }

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

  private parseExtractionResponse(
    response: string, 
    baseConfidence: number, 
    documentType: string,
    expectWorkActivities: boolean = false
  ): { events: ExtractedDelayEvent[]; workActivities?: IDRWorkActivity[] } {
    try {
      let eventsArray: Array<Record<string, unknown>> = [];
      let workActivities: IDRWorkActivity[] | undefined;

      if (expectWorkActivities) {
        const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        const cleanedResponse = jsonBlockMatch ? jsonBlockMatch[1].trim() : response;
        
        const objectStartIndex = cleanedResponse.indexOf('{');
        if (objectStartIndex !== -1) {
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
          
          try {
            const parsed = JSON.parse(objectStr) as IDRExtractionResponse;
            
            if (parsed.workActivities && Array.isArray(parsed.workActivities)) {
              workActivities = parsed.workActivities
                .filter(wa => wa.activityId && wa.activityId.trim().length > 0)
                .map(wa => ({
                  activityId: String(wa.activityId || '').trim(),
                  description: String(wa.description || '').trim(),
                  comments: wa.comments ? String(wa.comments).trim() : undefined,
                }));
            }
            if (parsed.delayEvents && Array.isArray(parsed.delayEvents)) {
              eventsArray = parsed.delayEvents;
            }
          } catch (parseError) {
            console.warn('[AIDelayEventExtractor] Failed to parse IDR object format, falling back to array:', parseError);
            const arrayMatch = response.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
              const parsed = JSON.parse(arrayMatch[0]);
              if (Array.isArray(parsed)) {
                eventsArray = parsed;
              }
            }
          }
        } else {
          const arrayMatch = response.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            const parsed = JSON.parse(arrayMatch[0]);
            if (Array.isArray(parsed)) {
              eventsArray = parsed;
            }
          }
        }
      } else {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            eventsArray = parsed;
          }
        }
      }

      const events = eventsArray.map((item: Record<string, unknown>) => {
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
    } catch (error) {
      console.error('Error parsing extraction response:', error);
      return { events: [] };
    }
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
