import { randomUUID } from 'crypto';
import type { RunSingleDocumentAnalysisCommand } from '../RunSingleDocumentAnalysisCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IDelayEventExtractor, ExtractedDelayEvent } from '../../../../domain/delay-analysis/interfaces/IDelayEventExtractor';
import type { IActivityMatcher } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { IProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import type { TokenUsageCallback } from '../../../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import type { IDRWorkActivity } from '../../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { IIDRMatchEnforcementPolicy } from '../../../../domain/delay-analysis/interfaces/IIDRMatchEnforcementPolicy';
import type { IFieldMemoContextProvider } from '../../../../domain/delay-analysis/interfaces/IFieldMemoContextProvider';
import type { IPodEvidenceProvider } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import { toPodEvidenceDateKey } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import type { PodMatchEvidence } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import { NoOpProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import { extractReportDateFromIDR } from '../../../../infrastructure/delay-analysis/ReportDateExtractor';
import { renderPodDayContext } from '../../../../infrastructure/delay-analysis/PodContextRenderer';
import { resolveDurationProvenance } from '../../../../domain/delay-analysis/DurationProvenance';

const MIN_MATCH_CONFIDENCE_FOR_SKIP = 85;

export interface RunSingleDocumentAnalysisResult {
  eventsExtracted: number;
  eventsMatched: number;
  errors: string[];
}

export interface RunSingleDocumentAnalysisOptions {
  runId?: string;
  progressReporter?: IProgressReporter;
  onTokenUsage?: TokenUsageCallback;
  enableToolBasedMatching?: boolean;
}

function normalizeImpactDuration(value: unknown): number | null {
  if (value == null) return null;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  // Durations calculated from diary timestamp gaps are frequently fractional (0.75h, 1.5h).
  // Keep two decimals rather than rounding to whole hours, which used to destroy those values.
  return Math.round(num * 100) / 100;
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
  if (!startDate) {
    return { isValid: true };
  }
  if (reportDate.getTime() < startDate.getTime()) {
    return {
      isValid: false,
      reason: `Report date (${reportDate.toISOString().split('T')[0]}) is before activity start date (${startDate.toISOString().split('T')[0]})`,
    };
  }
  return { isValid: true };
}

export class RunSingleDocumentAnalysisCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly eventRepository: IContractorDelayEventRepository,
    private readonly extractor: IDelayEventExtractor,
    private readonly matcher: IActivityMatcher,
    private readonly idrMatchPolicy?: IIDRMatchEnforcementPolicy,
    private readonly fieldMemoContextProvider?: IFieldMemoContextProvider,
    private readonly podEvidenceProvider?: IPodEvidenceProvider
  ) {}

  /**
   * Resolves POD evidence for a document's report date, if a POD evidence provider is wired
   * and a POD report exists for that date. Any failure is logged and treated as "no POD" —
   * POD is an enhancement, never a dependency of analysis completing.
   */
  private async loadPodEvidenceForDate(
    projectId: string,
    tenantId: string,
    date: Date | null
  ): Promise<PodMatchEvidence | undefined> {
    if (!this.podEvidenceProvider || !date) {
      return undefined;
    }
    try {
      const evidenceByDate = await this.podEvidenceProvider.getEvidenceForDateRange(projectId, tenantId, date, date);
      const reports = evidenceByDate.get(toPodEvidenceDateKey(date)) ?? [];
      if (reports.length === 0) {
        console.log(`[SingleDocAnalysis] POD context: no POD report found for ${toPodEvidenceDateKey(date)}`);
        return undefined;
      }
      const contextText = renderPodDayContext(reports);
      console.log(`[SingleDocAnalysis] POD context: found ${reports.length} report(s) for ${toPodEvidenceDateKey(date)} (${reports.reduce((sum, r) => sum + r.sections.length, 0)} sections)`);
      return { contextText, reports };
    } catch (error) {
      console.warn('[SingleDocAnalysis] Failed to load POD evidence (continuing without it):', error);
      return undefined;
    }
  }

  async execute(
    command: RunSingleDocumentAnalysisCommand,
    options?: RunSingleDocumentAnalysisOptions
  ): Promise<RunSingleDocumentAnalysisResult> {
    const progress = options?.progressReporter || new NoOpProgressReporter();

    const result: RunSingleDocumentAnalysisResult = {
      eventsExtracted: 0,
      eventsMatched: 0,
      errors: [],
    };

    progress.report({
      stage: 'loading_documents',
      message: 'Loading document...',
      percentage: 0,
    });

    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      progress.error(`Project ${command.projectId} not found`);
      throw new Error(`Project ${command.projectId} not found`);
    }

    const doc = await this.documentRepository.findById(command.documentId, command.tenantId);
    if (!doc) {
      progress.error(`Document ${command.documentId} not found`);
      throw new Error(`Document ${command.documentId} not found`);
    }

    if (doc.projectId !== command.projectId) {
      progress.error('Document does not belong to this project');
      throw new Error('Document does not belong to this project');
    }

    if (doc.status !== 'completed' || !doc.rawContent) {
      progress.error(`Document "${doc.filename}" has not been parsed yet (status: ${doc.status})`);
      throw new Error(`Document "${doc.filename}" has not been parsed yet`);
    }

    const validTypes = ['idr', 'ncr', 'field_memo'];
    if (!validTypes.includes(doc.documentType)) {
      progress.error(`Document type "${doc.documentType}" is not supported for delay analysis`);
      throw new Error(`Document type "${doc.documentType}" is not supported for delay analysis`);
    }

    progress.report({
      stage: 'extracting_events',
      message: `Extracting delay events from ${doc.filename}...`,
      percentage: 10,
    });

    let fieldMemoContext: string | null = null;
    if (doc.documentType === 'idr' && this.fieldMemoContextProvider) {
      try {
        const docDate = doc.reportDate ? new Date(doc.reportDate) : null;
        const docMonth = docDate ? docDate.getMonth() + 1 : undefined;
        const docYear = docDate ? docDate.getFullYear() : undefined;
        fieldMemoContext = await this.fieldMemoContextProvider.getConsolidatedContext(
          command.projectId,
          command.tenantId,
          docMonth,
          docYear
        );
        if (fieldMemoContext) {
          console.log(`[SingleDocAnalysis] Field memo context loaded (${fieldMemoContext.length} chars)`);
        }
      } catch (error) {
        console.warn('[SingleDocAnalysis] Failed to load field memo context:', error);
      }
    }

    let workActivities: IDRWorkActivity[] = [];
    let reportDate: Date | null = null;
    // POD evidence for the document's *effective* report date. Starts from the stored date and is
    // re-resolved below if extraction recovers a different one, so the audit metadata written onto
    // each event always describes the same evidence matching later uses.
    let effectivePodEvidence: PodMatchEvidence | undefined;

    // Resolve up front from the document's own stored report date; if extraction later derives
    // a better date (IDR fallback parsing), matching below re-resolves POD evidence for it.
    const preExtractionPodEvidence = await this.loadPodEvidenceForDate(
      command.projectId,
      command.tenantId,
      doc.reportDate ?? null
    );

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
          fieldMemoContext: fieldMemoContext ?? undefined,
          podContext: preExtractionPodEvidence?.contextText ?? undefined,
        }
      );

      reportDate = doc.reportDate ?? (doc.documentType === 'idr'
        ? extractReportDateFromIDR(doc.rawContent!)
        : null);

      effectivePodEvidence = reportDate === (doc.reportDate ?? null)
        ? preExtractionPodEvidence
        : await this.loadPodEvidenceForDate(command.projectId, command.tenantId, reportDate);

      if (extractionResult.workActivities && extractionResult.workActivities.length > 0) {
        workActivities = extractionResult.workActivities;
        const activityIds = workActivities.map(a => a.activityId).join(', ');
        const dateInfo = reportDate ? ` (${reportDate.toISOString().split('T')[0]})` : '';
        progress.report({
          stage: 'extracting_events',
          message: `Found activities: ${activityIds}${dateInfo}`,
          percentage: 30,
        });
      }

      if (extractionResult.events.length === 0) {
        progress.report({
          stage: 'extracting_events',
          message: `No delay events found in ${doc.filename}`,
          percentage: 40,
        });
      } else {
        const certaintySuffix = extractionResult.delayIsCertain
          ? ' (high confidence - definite delays)'
          : ' (requires verification)';
        progress.report({
          stage: 'extracting_events',
          message: `Found ${extractionResult.events.length} delay events in ${doc.filename}${certaintySuffix}`,
          percentage: 40,
          details: {
            current: 1,
            total: 1,
          },
        });
      }

      progress.report({
        stage: 'saving_events',
        message: 'Clearing previous events for this document...',
        percentage: 45,
      });

      const existingEvents = await this.eventRepository.findByDocumentId(doc.id, command.tenantId);
      if (existingEvents.length > 0) {
        await this.eventRepository.deleteByDocumentId(doc.id, command.tenantId);
        progress.report({
          stage: 'saving_events',
          message: `Cleared ${existingEvents.length} previous events`,
          percentage: 47,
        });
      }

      const preMatchedActivityCodes = new Set<string>();
      for (const extracted of extractionResult.events) {
        if (extracted.matchedActivityId &&
            extracted.matchConfidence !== undefined &&
            extracted.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100) {
          preMatchedActivityCodes.add(extracted.matchedActivityId);
        }
      }

      const activityCodeToUuidMap = new Map<string, string>();
      if (preMatchedActivityCodes.size > 0) {
        for (const activityCode of Array.from(preMatchedActivityCodes)) {
          const activity = await this.scheduleRepository.findByActivityId(
            command.projectId,
            command.tenantId,
            activityCode
          );
          if (activity) {
            activityCodeToUuidMap.set(activityCode, activity.id);
          }
        }
      }

      progress.report({
        stage: 'saving_events',
        message: `Saving ${extractionResult.events.length} delay events...`,
        percentage: 50,
      });

      let preMatchedCount = 0;
      let idrPolicyRejections = 0;
      const preMatchedEventEntities: ContractorDelayEvent[] = [];

      for (const extracted of extractionResult.events) {
        const now = new Date();
        const activityCode = extracted.matchedActivityId;
        const activityUuid = activityCode ? activityCodeToUuidMap.get(activityCode) : undefined;
        let hasPreMatch = !!(activityCode &&
          activityUuid &&
          extracted.matchConfidence !== undefined &&
          extracted.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100);

        let enforcedConfidence: number | undefined;
        if (hasPreMatch && this.idrMatchPolicy) {
          if (workActivities.length > 0) {
            const validation = this.idrMatchPolicy.validatePreMatch(
              activityCode!,
              Math.round(extracted.matchConfidence! * 100),
              workActivities
            );
            if (!validation.isValid) {
              hasPreMatch = false;
              idrPolicyRejections++;
            } else if (validation.correctedConfidence !== undefined) {
              enforcedConfidence = validation.correctedConfidence;
            }
          }
        }

        const eventId = randomUUID();
        if (hasPreMatch) {
          preMatchedCount++;
        }

        const provenance = resolveDurationProvenance({
          rawBasis: extracted.durationBasis,
          rawWindowStart: extracted.impactedWindowStart,
          rawWindowEnd: extracted.impactedWindowEnd,
          rawImpactDurationHours: normalizeImpactDuration(extracted.impactDurationHours),
          eventStartDate: extracted.eventDate,
        });
        const podReportsForDate = effectivePodEvidence?.reports ?? [];
        // Only attribute a specific POD document at creation time when exactly one report
        // exists for the date — with multiple reports, the actual corroborating report (if any)
        // is only known once matching runs, so naming "the first" here would be misleading.
        const podSourceDocumentId = podReportsForDate.length === 1 ? podReportsForDate[0].sourceDocumentId : null;
        const podCreationUsageNote = podReportsForDate.length === 1
          ? 'POD context was available for this date and supplied to extraction as crew/equipment context.'
          : podReportsForDate.length > 1
            ? `${podReportsForDate.length} POD reports were available for this date and supplied to extraction as context; the specific corroborating report (if any) is determined at match time.`
            : null;

        const event = new ContractorDelayEvent({
          id: eventId,
          projectId: command.projectId,
          tenantId: command.tenantId,
          sourceDocumentId: doc.id,
          matchedActivityId: hasPreMatch ? activityUuid! : null,
          wbs: hasPreMatch ? (extracted.matchedActivityWbs ?? null) : null,
          cpmActivityId: hasPreMatch ? activityCode! : null,
          cpmActivityDescription: hasPreMatch ? (extracted.matchedActivityDescription ?? null) : null,
          eventDescription: extracted.eventDescription,
          eventCategory: extracted.eventCategory,
          eventStartDate: extracted.eventDate,
          eventFinishDate: provenance.eventFinishDate,
          impactDurationHours: provenance.impactDurationHours,
          impactedWindowStart: provenance.windowStart,
          impactedWindowEnd: provenance.windowEnd,
          durationBasis: provenance.durationBasis,
          sourceReference: extracted.sourceReference,
          extractedFromCode: extracted.extractedFromCode,
          matchConfidence: hasPreMatch ? (enforcedConfidence ?? Math.round(extracted.matchConfidence! * 100)) : null,
          matchReasoning: hasPreMatch ? (extracted.matchReasoning ?? '[Pre-matched during extraction]') : null,
          delayEventConfidence: extracted.delayEventConfidence
            ? Math.round(extracted.delayEventConfidence * 100)
            : null,
          verificationStatus: 'pending',
          verifiedBy: null,
          verifiedAt: null,
          // Records whether POD evidence existed for this document's date at extraction time, so a
          // run's POD influence stays auditable from the event rather than only from prompt logs.
          // `podCorroborated` starts false on every event and is only raised by an actual
          // corroborated match, so "not corroborated" is always distinguishable from "never checked".
          // podSourceDocumentId/podUsageNote at creation time describe extraction-time context;
          // the post-match metadata patch below overwrites podUsageNote once actual matching
          // usage (corroboration/reordering/context-only) is known.
          metadata: {
            podEvidenceAvailable: podReportsForDate.length > 0,
            podReportCount: podReportsForDate.length,
            podCorroborated: false,
            podSourceDocumentId,
            podUsageNote: podCreationUsageNote,
            ...(provenance.rejectedBoundedClaimNote ? { rejectedBoundedClaimNote: provenance.rejectedBoundedClaimNote } : {}),
          },
          createdAt: now,
          updatedAt: now,
        });

        await this.eventRepository.save(event);
        result.eventsExtracted++;
        if (hasPreMatch) {
          result.eventsMatched++;
          preMatchedEventEntities.push(event);
        }
      }

      if (preMatchedEventEntities.length > 0) {
        const allActivities = await this.scheduleRepository.findByProjectId(
          command.projectId,
          command.tenantId
        );

        if (allActivities.length > 0) {
          let invalidatedCount = 0;
          for (const event of preMatchedEventEntities) {
            if (!event.matchedActivityId) continue;
            const effectiveReportDate = reportDate ?? event.eventStartDate;
            const validation = validateMatchAgainstReportDate(
              event.matchedActivityId,
              effectiveReportDate,
              allActivities
            );
            if (!validation.isValid) {
              const clearedEvent = event.clearActivityMatch();
              await this.eventRepository.update(clearedEvent);
              invalidatedCount++;
              result.eventsMatched = Math.max(0, result.eventsMatched - 1);
            }
          }
          if (invalidatedCount > 0) {
            console.log(`[SingleDocAnalysis] Invalidated ${invalidatedCount} pre-matched events due to date validation`);
          }
        }
      }

      if (idrPolicyRejections > 0) {
        progress.report({
          stage: 'saving_events',
          message: `${idrPolicyRejections} pre-matches corrected by IDR enforcement policy`,
          percentage: 55,
        });
      }

      if (preMatchedCount > 0) {
        progress.report({
          stage: 'saving_events',
          message: `${preMatchedCount} events pre-matched during extraction`,
          percentage: 58,
        });
      }

    } catch (error) {
      result.errors.push(`Failed to extract from ${doc.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      progress.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }

    progress.report({
      stage: 'matching_events',
      message: 'Loading schedule activities for matching...',
      percentage: 60,
    });

    const activities = await this.scheduleRepository.findByProjectId(
      command.projectId,
      command.tenantId
    );

    if (activities.length === 0) {
      result.errors.push('No schedule activities available for matching');
      progress.report({
        stage: 'matching_events',
        message: 'No schedule activities found. Skipping matching.',
        percentage: 90,
      });
    } else {
      const unmatchedEvents = (await this.eventRepository.findByDocumentId(doc.id, command.tenantId))
        .filter(e => !e.matchedActivityId);

      if (unmatchedEvents.length === 0) {
        progress.report({
          stage: 'matching_events',
          message: 'All events already matched during extraction',
          percentage: 90,
        });
      } else {
        progress.report({
          stage: 'matching_events',
          message: `Matching ${unmatchedEvents.length} events to schedule activities...`,
          percentage: 65,
          details: { total: unmatchedEvents.length },
        });

        // Resolved once for the document's report date and reused for every event's match
        // call below, per the "load once per run, not per event" database-efficiency rule.
        const matchPodEvidence = effectivePodEvidence;

        for (let i = 0; i < unmatchedEvents.length; i++) {
          const event = unmatchedEvents[i];
          const matchProgress = 65 + Math.floor((i / unmatchedEvents.length) * 25);

          const truncatedDesc = event.eventDescription.length > 50
            ? event.eventDescription.substring(0, 50) + '...'
            : event.eventDescription;
          progress.report({
            stage: 'matching_events',
            message: `Linking to schedule (${i + 1}/${unmatchedEvents.length}): ${truncatedDesc}`,
            percentage: matchProgress,
            details: { current: i + 1, total: unmatchedEvents.length },
          });

          try {
            const matchResult = await this.matcher.matchEventToActivities(
              event.eventDescription,
              event.eventStartDate,
              activities,
              {
                runId: options?.runId,
                onTokenUsage: options?.onTokenUsage,
                idrWorkActivities: workActivities.length > 0 ? workActivities : undefined,
                reportDate: reportDate ?? undefined,
                podEvidence: matchPodEvidence,
              }
            );

            if (matchResult) {
              const effectiveReportDate = reportDate ?? event.eventStartDate;
              const validation = validateMatchAgainstReportDate(
                matchResult.matchedActivityId,
                effectiveReportDate,
                activities
              );

              if (!validation.isValid) {
                console.log(`[SingleDocAnalysis] Match rejected for event ${event.id}: ${validation.reason}`);
                continue;
              }

              const matchedEvent = event.withActivityMatch(
                matchResult.matchedActivityId,
                matchResult.cpmActivityId,
                matchResult.cpmActivityDescription,
                matchResult.wbs,
                matchResult.confidence,
                matchResult.reasoning,
                {
                  podCorroborated: matchResult.podCorroborated === true,
                  ...(matchResult.podUsageNote ? { podUsageNote: matchResult.podUsageNote } : {}),
                  // Only overrides podSourceDocumentId when the matcher pinpointed the exact
                  // corroborating report; otherwise the creation-time value (set only when
                  // unambiguous) is left as-is rather than guessed.
                  ...(matchResult.podSourceDocumentId ? { podSourceDocumentId: matchResult.podSourceDocumentId } : {}),
                }
              );

              await this.eventRepository.update(matchedEvent);
              result.eventsMatched++;

              progress.report({
                stage: 'matching_events',
                message: `Matched to ${matchResult.cpmActivityId}: ${matchResult.cpmActivityDescription.substring(0, 40)}...`,
                percentage: matchProgress,
                details: { current: i + 1, total: unmatchedEvents.length },
              });
            }
          } catch (error) {
            result.errors.push(`Failed to match event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
