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
import { extractReportDateFromIDR } from '../../../../infrastructure/delay-analysis/ReportDateExtractor';

interface DocumentExtractionContext {
  workActivities: IDRWorkActivity[];
  reportDate: Date | null;
}

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

function validateMatchAgainstReportDate(
  activityId: string | null | undefined,
  reportDate: Date | null | undefined,
  activities: Array<{ id: string; actualStartDate: Date | null; actualFinishDate: Date | null; plannedStartDate: Date | null; plannedFinishDate: Date | null }>
): { isValid: boolean; reason?: string } {
  if (!activityId || !reportDate) {
    return { isValid: true };
  }

  const activity = activities.find(a => a.id === activityId);
  if (!activity) {
    return { isValid: true };
  }

  const startDate = activity.actualStartDate ?? activity.plannedStartDate;
  const endDate = activity.actualFinishDate ?? activity.plannedFinishDate;

  if (!startDate && !endDate) {
    return { isValid: true };
  }

  const reportTime = reportDate.getTime();

  if (startDate && reportTime < startDate.getTime()) {
    return { 
      isValid: false, 
      reason: `Report date (${reportDate.toISOString().split('T')[0]}) is before activity start date (${startDate.toISOString().split('T')[0]})` 
    };
  }

  if (endDate && reportTime > endDate.getTime()) {
    return { 
      isValid: false, 
      reason: `Report date (${reportDate.toISOString().split('T')[0]}) is after activity end date (${endDate.toISOString().split('T')[0]})` 
    };
  }

  return { isValid: true };
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

    const documentContexts = new Map<string, DocumentExtractionContext>();

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

      let fieldReports = documents.filter(doc => 
        doc.status === 'completed' && 
        (doc.documentType === 'idr' || doc.documentType === 'ncr' || doc.documentType === 'field_memo') &&
        doc.rawContent
      );

      if (command.filterMonth !== undefined && command.filterYear !== undefined) {
        const originalCount = fieldReports.length;
        fieldReports = fieldReports.filter(doc => {
          if (!doc.reportDate) return false;
          const docDate = new Date(doc.reportDate);
          return docDate.getMonth() + 1 === command.filterMonth && 
                 docDate.getFullYear() === command.filterYear;
        });
        console.log(`[Analysis] Date filter applied: ${command.filterMonth}/${command.filterYear} - ${fieldReports.length} of ${originalCount} documents matched`);
      }

      if (fieldReports.length === 0) {
        const filterMessage = command.filterMonth !== undefined && command.filterYear !== undefined
          ? `No documents found for ${command.filterMonth}/${command.filterYear}. Upload documents for this period or select a different date range.`
          : 'No parsed documents found. Please upload and parse IDRs first.';
        progress.report({
          stage: 'loading_documents',
          message: filterMessage,
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

            const reportDate = doc.reportDate ?? (doc.documentType === 'idr' 
              ? extractReportDateFromIDR(doc.rawContent!) 
              : null);

            if (extractionResult.workActivities && extractionResult.workActivities.length > 0) {
              documentContexts.set(doc.id, {
                workActivities: extractionResult.workActivities,
                reportDate,
              });
              const dateInfo = reportDate ? ` (report date: ${reportDate.toISOString().split('T')[0]})` : '';
              progress.report({
                stage: 'extracting_events',
                message: `Found ${extractionResult.workActivities.length} work activities in ${doc.filename}${dateInfo}`,
                percentage: docProgress,
                details: { current: i + 1, total: fieldReports.length },
              });
            } else if (reportDate) {
              documentContexts.set(doc.id, {
                workActivities: [],
                reportDate,
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

        if (documentContexts.size > 0) {
          const totalWorkActivities = Array.from(documentContexts.values())
            .reduce((sum, ctx) => sum + ctx.workActivities.length, 0);
          console.log(`[RunAnalysisCommandHandler] Collected ${totalWorkActivities} work activities from ${documentContexts.size} documents for force-matching`);
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
        const preMatchedEvents: ContractorDelayEvent[] = [];
        for (const deduped of deduplicatedEvents) {
          const now = new Date();
          const hasPreMatch = deduped.event.matchedActivityId && 
            deduped.event.matchConfidence !== undefined &&
            deduped.event.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100;
          
          const eventId = randomUUID();
          if (hasPreMatch) {
            preMatchedCount++;
          }

          const event = new ContractorDelayEvent({
            id: eventId,
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
            preMatchedEvents.push(event);
          }
        }
        
        if (preMatchedEvents.length > 0 && shouldMatch) {
          const allDocuments = await this.documentRepository.findByProjectId(
            command.projectId,
            command.tenantId
          );
          const documentReportDates = new Map<string, Date>();
          for (const doc of allDocuments) {
            if (doc.reportDate) {
              documentReportDates.set(doc.id, doc.reportDate);
            }
          }

          const allActivities = await this.scheduleRepository.findByProjectId(
            command.projectId,
            command.tenantId
          );

          if (allActivities.length > 0) {
            let invalidatedCount = 0;
            for (const event of preMatchedEvents) {
              if (!event.matchedActivityId || !event.sourceDocumentId) continue;

              const storedReportDate = documentReportDates.get(event.sourceDocumentId);
              const reportDate = storedReportDate ?? event.eventStartDate;
              if (!storedReportDate && event.eventStartDate) {
                console.log(`[RunAnalysisCommandHandler] Using eventStartDate as fallback for validation (no reportDate stored for doc ${event.sourceDocumentId})`);
              }
              const validation = validateMatchAgainstReportDate(
                event.matchedActivityId,
                reportDate,
                allActivities
              );

              if (!validation.isValid) {
                console.log(`[RunAnalysisCommandHandler] Invalidating pre-match for event ${event.id}: ${validation.reason}`);
                const clearedEvent = event.clearActivityMatch();
                await this.eventRepository.update(clearedEvent);
                invalidatedCount++;
                result.eventsMatched = Math.max(0, result.eventsMatched - 1);
              }
            }

            if (invalidatedCount > 0) {
              console.log(`[RunAnalysisCommandHandler] Invalidated ${invalidatedCount} pre-matched events due to date validation`);
            }
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

        const allDocs = await this.documentRepository.findByProjectId(
          command.projectId,
          command.tenantId
        );
        const allDocumentReportDates = new Map<string, Date>();
        for (const doc of allDocs) {
          if (doc.reportDate) {
            allDocumentReportDates.set(doc.id, doc.reportDate);
          }
        }

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
              const docContext = event.sourceDocumentId 
                ? documentContexts.get(event.sourceDocumentId)
                : undefined;

              const matchResult = await this.matcher.matchEventToActivities(
                event.eventDescription,
                event.eventStartDate,
                activities,
                { 
                  runId: options?.runId, 
                  onTokenUsage: options?.onTokenUsage,
                  idrWorkActivities: docContext?.workActivities,
                  reportDate: docContext?.reportDate ?? undefined,
                }
              );

              if (matchResult) {
                const storedReportDate = docContext?.reportDate 
                  ?? (event.sourceDocumentId ? allDocumentReportDates.get(event.sourceDocumentId) : null);
                const reportDate = storedReportDate ?? event.eventStartDate;
                if (!storedReportDate && event.eventStartDate) {
                  console.log(`[RunAnalysisCommandHandler] Using eventStartDate as fallback for matching validation (no reportDate for event ${event.id})`);
                }
                const validation = validateMatchAgainstReportDate(
                  matchResult.matchedActivityId,
                  reportDate,
                  activities
                );

                if (!validation.isValid) {
                  console.log(`[RunAnalysisCommandHandler] Match rejected for event ${event.id}: ${validation.reason}`);
                  continue;
                }

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
