import { randomUUID } from 'crypto';
import type { RunAnalysisCommand } from '../RunAnalysisCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor, ExtractedDelayEvent } from '../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import type { TokenUsageCallback } from '../../../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import type { IDRWorkActivity } from '../../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { 
  IDelayEventDeduplicationService,
  ExtractedEventWithSource 
} from '../../../../domain/delay-analysis/interfaces/IDelayEventDeduplicationService';
import { NoOpProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

const MIN_MATCH_CONFIDENCE_FOR_SKIP = 85;

export interface RunAnalysisResult {
  eventsExtracted: number;
  eventsMatched: number;
  documentsProcessed: number;
  errors: string[];
}

export interface RunAnalysisOptions {
  runId?: string;
  progressReporter?: IProgressReporter;
  onTokenUsage?: TokenUsageCallback;
  enableToolBasedMatching?: boolean;
}


function normalizeImpactDuration(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return Math.round(num);
}

export class RunAnalysisCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly eventRepository: IContractorDelayEventRepository,
    private readonly extractor: IDelayEventExtractor,
    private readonly matcher: IActivityMatcher,
    private readonly deduplicationService: IDelayEventDeduplicationService
  ) {}

  async execute(command: RunAnalysisCommand, options?: RunAnalysisOptions): Promise<RunAnalysisResult> {
    const progress = options?.progressReporter || new NoOpProgressReporter();

    progress.report({
      stage: 'loading_documents',
      message: 'Starting analysis...',
      percentage: 0,
    });

    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      progress.error(`Project ${command.projectId} not found`);
      throw new Error(`Project ${command.projectId} not found`);
    }

    const result: RunAnalysisResult = {
      eventsExtracted: 0,
      eventsMatched: 0,
      documentsProcessed: 0,
      errors: [],
    };

    const shouldExtract = command.extractFromDocuments !== false;
    const shouldMatch = command.matchToActivities !== false;

    const documentWorkActivities = new Map<string, IDRWorkActivity[]>();

    if (shouldExtract) {
      progress.report({
        stage: 'loading_documents',
        message: 'Loading parsed documents...',
        percentage: 5,
      });

      const documents = await this.documentRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      const fieldReports = documents.filter(doc => 
        doc.status === 'completed' && 
        (doc.documentType === 'idr' || doc.documentType === 'ncr' || doc.documentType === 'field_memo') &&
        doc.rawContent
      );

      if (fieldReports.length === 0) {
        progress.report({
          stage: 'loading_documents',
          message: 'No parsed documents found. Please upload and parse IDRs first.',
          percentage: 10,
        });
      } else {
        progress.report({
          stage: 'extracting_events',
          message: `Found ${fieldReports.length} documents to analyze`,
          percentage: 10,
          details: { total: fieldReports.length },
        });

        const allExtractedEvents: ExtractedEventWithSource[] = [];

        for (let i = 0; i < fieldReports.length; i++) {
          const doc = fieldReports[i];
          const docProgress = 10 + Math.floor((i / fieldReports.length) * 30);

          progress.report({
            stage: 'extracting_events',
            message: `Extracting delay events from ${doc.filename}...`,
            percentage: docProgress,
            details: { current: i + 1, total: fieldReports.length },
          });

          try {
            const extractionResult = await this.extractor.extractDelayEvents(
              doc.rawContent!,
              doc.filename,
              doc.id,
              { 
                runId: options?.runId, 
                onTokenUsage: options?.onTokenUsage,
                documentType: doc.documentType,
                tenantId: command.tenantId,
                projectId: command.projectId,
                enableToolBasedMatching: options?.enableToolBasedMatching ?? true,
              }
            );

            if (extractionResult.workActivities && extractionResult.workActivities.length > 0) {
              documentWorkActivities.set(doc.id, extractionResult.workActivities);
              progress.report({
                stage: 'extracting_events',
                message: `Found ${extractionResult.workActivities.length} work activities in ${doc.filename} (for fast-matching)`,
                percentage: docProgress,
                details: { current: i + 1, total: fieldReports.length },
              });
            }

            for (const extracted of extractionResult.events) {
              allExtractedEvents.push({
                event: extracted,
                sourceDocumentId: doc.id,
              });
            }

            result.documentsProcessed++;

            if (extractionResult.events.length > 0) {
              const certaintySuffix = extractionResult.delayIsCertain 
                ? ' (high confidence - definite delays)' 
                : ' (requires verification)';
              progress.report({
                stage: 'extracting_events',
                message: `Found ${extractionResult.events.length} delay events in ${doc.filename}${certaintySuffix}`,
                percentage: docProgress,
                details: { 
                  current: i + 1, 
                  total: fieldReports.length,
                  strategyUsed: extractionResult.strategyUsed,
                  baseConfidence: extractionResult.baseConfidence,
                },
              });
            }
          } catch (error) {
            result.errors.push(`Failed to extract from ${doc.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        if (documentWorkActivities.size > 0) {
          const totalWorkActivities = Array.from(documentWorkActivities.values())
            .reduce((sum, activities) => sum + activities.length, 0);
          console.log(`[RunAnalysisCommandHandler] Collected ${totalWorkActivities} work activities from ${documentWorkActivities.size} documents for fast-matching`);
        }

        progress.report({
          stage: 'deduplicating_events',
          message: `Deduplicating ${allExtractedEvents.length} extracted events...`,
          percentage: 42,
        });

        const deduplicatedEvents = this.deduplicationService.deduplicateWithSources(allExtractedEvents);

        const duplicatesRemoved = allExtractedEvents.length - deduplicatedEvents.length;
        if (duplicatesRemoved > 0) {
          progress.report({
            stage: 'deduplicating_events',
            message: `Removed ${duplicatesRemoved} duplicate events (same delay mentioned in multiple documents)`,
            percentage: 45,
          });
        }

        progress.report({
          stage: 'saving_events',
          message: `Saving ${deduplicatedEvents.length} unique delay events...`,
          percentage: 47,
        });

        let preMatchedCount = 0;
        for (const deduped of deduplicatedEvents) {
          const now = new Date();
          const hasPreMatch = deduped.event.matchedActivityId && 
            deduped.event.matchConfidence !== undefined &&
            deduped.event.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100;
          
          if (hasPreMatch) {
            preMatchedCount++;
          }

          const event = new ContractorDelayEvent({
            id: randomUUID(),
            projectId: command.projectId,
            tenantId: command.tenantId,
            sourceDocumentId: deduped.primarySourceDocumentId,
            matchedActivityId: hasPreMatch ? deduped.event.matchedActivityId! : null,
            wbs: hasPreMatch ? (deduped.event.matchedActivityWbs ?? null) : null,
            cpmActivityId: hasPreMatch ? deduped.event.matchedActivityId! : null,
            cpmActivityDescription: hasPreMatch ? (deduped.event.matchedActivityDescription ?? null) : null,
            eventDescription: deduped.event.eventDescription,
            eventCategory: deduped.event.eventCategory,
            eventStartDate: deduped.event.eventDate,
            eventFinishDate: null,
            impactDurationHours: normalizeImpactDuration(deduped.event.impactDurationHours),
            sourceReference: deduped.event.sourceReference,
            extractedFromCode: deduped.event.extractedFromCode,
            matchConfidence: hasPreMatch ? Math.round(deduped.event.matchConfidence! * 100) : null,
            matchReasoning: hasPreMatch ? (deduped.event.matchReasoning ?? '[Pre-matched during extraction]') : null,
            verificationStatus: 'pending',
            verifiedBy: null,
            verifiedAt: null,
            metadata: deduped.sourceDocumentIds.length > 1 
              ? { allSourceDocumentIds: deduped.sourceDocumentIds } 
              : null,
            createdAt: now,
            updatedAt: now,
          });

          await this.eventRepository.save(event);
          result.eventsExtracted++;
          if (hasPreMatch) {
            result.eventsMatched++;
          }
        }

        if (preMatchedCount > 0) {
          progress.report({
            stage: 'saving_events',
            message: `${preMatchedCount} events were pre-matched during extraction (activity ID detected in document)`,
            percentage: 48,
          });
          console.log(`[RunAnalysisCommandHandler] ${preMatchedCount} events pre-matched during extraction`);
        }
      }
    }

    if (shouldMatch) {
      progress.report({
        stage: 'loading_activities',
        message: 'Loading schedule activities...',
        percentage: 50,
      });

      const activities = await this.scheduleRepository.findByProjectId(
        command.projectId,
        command.tenantId
      );

      if (activities.length === 0) {
        result.errors.push('No schedule activities available for matching');
        progress.report({
          stage: 'loading_activities',
          message: 'No schedule activities found. Please upload a schedule first.',
          percentage: 55,
        });
      } else {
        progress.report({
          stage: 'matching_events',
          message: `Loaded ${activities.length} schedule activities`,
          percentage: 55,
        });

        const unmatchedEvents = await this.eventRepository.findUnmatched(
          command.projectId,
          command.tenantId
        );

        if (unmatchedEvents.length === 0) {
          progress.report({
            stage: 'matching_events',
            message: 'No unmatched events to process',
            percentage: 90,
          });
        } else {
          progress.report({
            stage: 'matching_events',
            message: `Matching ${unmatchedEvents.length} events to schedule activities...`,
            percentage: 60,
            details: { total: unmatchedEvents.length },
          });

          let fastMatchCount = 0;
          for (let i = 0; i < unmatchedEvents.length; i++) {
            const event = unmatchedEvents[i];
            const matchProgress = 60 + Math.floor((i / unmatchedEvents.length) * 30);

            progress.report({
              stage: 'matching_events',
              message: `Matching event ${i + 1} of ${unmatchedEvents.length}...`,
              percentage: matchProgress,
              details: { current: i + 1, total: unmatchedEvents.length },
            });

            try {
              const idrWorkActivities = event.sourceDocumentId 
                ? documentWorkActivities.get(event.sourceDocumentId)
                : undefined;

              const matchResult = await this.matcher.matchEventToActivities(
                event.eventDescription,
                event.eventStartDate,
                activities,
                { 
                  runId: options?.runId, 
                  onTokenUsage: options?.onTokenUsage,
                  idrWorkActivities,
                }
              );

              if (matchResult) {
                if (matchResult.matchedViaIDRActivity) {
                  fastMatchCount++;
                }
                const matchedEvent = event.withActivityMatch(
                  matchResult.matchedActivityId,
                  matchResult.cpmActivityId,
                  matchResult.cpmActivityDescription,
                  matchResult.wbs,
                  matchResult.confidence,
                  matchResult.reasoning
                );

                await this.eventRepository.update(matchedEvent);
                result.eventsMatched++;
              }
            } catch (error) {
              result.errors.push(`Failed to match event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          if (fastMatchCount > 0) {
            console.log(`[RunAnalysisCommandHandler] ${fastMatchCount} of ${result.eventsMatched} events matched via IDR fast-match`);
          }
        }
      }
    }

    progress.report({
      stage: 'saving_events',
      message: 'Finalizing results...',
      percentage: 95,
    });

    progress.complete(
      `Analysis complete: ${result.eventsExtracted} events extracted, ${result.eventsMatched} matched`,
      { ...result, runId: options?.runId }
    );

    return result;
  }
}
