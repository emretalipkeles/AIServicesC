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
import type { IIDRMatchEnforcementPolicy } from '../../../../domain/delay-analysis/interfaces/IIDRMatchEnforcementPolicy';
import type { IAnalysisRunTracker } from '../../../../domain/delay-analysis/interfaces/IAnalysisRunTracker';
import type { IFieldMemoContextProvider } from '../../../../domain/delay-analysis/interfaces/IFieldMemoContextProvider';
import type { IPodEvidenceProvider } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import { toPodEvidenceDateKey } from '../../../../domain/delay-analysis/interfaces/IPodEvidenceProvider';
import type { PodReport } from '../../../../domain/delay-analysis/entities/PodReport';
import type { PodMatchEvidence } from '../../../../domain/delay-analysis/interfaces/IActivityMatcher';
import type { ProgressEvent } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { NoOpProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { ContractorDelayEvent } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import { extractReportDateFromIDR } from '../../../../infrastructure/delay-analysis/ReportDateExtractor';
import { renderPodDayContext } from '../../../../infrastructure/delay-analysis/PodContextRenderer';
import { resolveDurationProvenance } from '../../../../domain/delay-analysis/DurationProvenance';

class TrackingProgressReporter implements IProgressReporter {
  constructor(
    private readonly delegate: IProgressReporter,
    private readonly tracker: IAnalysisRunTracker,
    private readonly runId: string
  ) {}

  report(event: ProgressEvent): void {
    this.delegate.report(event);
    this.tracker.updateProgress(this.runId, event.stage, event.message, event.percentage);
  }

  complete(message: string, result?: unknown): void {
    this.delegate.complete(message, result);
  }

  error(message: string, error?: Error): void {
    this.delegate.error(message, error);
  }
}

interface DocumentExtractionContext {
  workActivities: IDRWorkActivity[];
  reportDate: Date | null;
  podEvidence?: PodMatchEvidence;
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
  // Durations calculated from diary timestamp gaps are frequently fractional (0.75h, 1.5h).
  // Keep two decimals rather than rounding to whole hours, which used to destroy those values.
  return Math.round(num * 100) / 100;
}

/**
 * Builds the metadata patch stored on a newly extracted event.
 * `podEvidenceAvailable` records whether POD data existed for the document's date at extraction time,
 * so a run's POD influence can be audited from the events themselves.
 */
function buildEventMetadata(
  sourceDocumentIds: string[],
  podAudit: { podEvidenceAvailable: boolean; podReportCount: number; podSourceDocumentId: string | null } | undefined,
  rejectedBoundedClaimNote?: string | null
): Record<string, unknown> | null {
  // `podCorroborated` starts false on every event and is only raised by an actual corroborated
  // match, so "not corroborated" is always distinguishable from "never checked".
  // podSourceDocumentId/podUsageNote at creation time describe extraction-time context; the
  // post-match metadata patch overwrites podUsageNote once actual matching usage
  // (corroboration/reordering/context-only) is known.
  const podReportCount = podAudit?.podReportCount ?? 0;
  const podSourceDocumentId = podAudit?.podSourceDocumentId ?? null;
  const podUsageNote = podSourceDocumentId
    ? 'POD context was available for this date and supplied to extraction as crew/equipment context.'
    : podReportCount > 1
      ? `${podReportCount} POD reports were available for this date and supplied to extraction as context; the specific corroborating report (if any) is determined at match time.`
      : null;
  const metadata: Record<string, unknown> = {
    podEvidenceAvailable: podAudit?.podEvidenceAvailable ?? false,
    podReportCount,
    podCorroborated: false,
    podSourceDocumentId,
    podUsageNote,
  };

  if (sourceDocumentIds.length > 1) {
    metadata.allSourceDocumentIds = sourceDocumentIds;
  }

  if (rejectedBoundedClaimNote) {
    metadata.rejectedBoundedClaimNote = rejectedBoundedClaimNote;
  }

  return metadata;
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
      reason: `Report date (${reportDate.toISOString().split('T')[0]}) is before activity start date (${startDate.toISOString().split('T')[0]})` 
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
    private readonly deduplicationService: IDelayEventDeduplicationService,
    private readonly idrMatchPolicy?: IIDRMatchEnforcementPolicy,
    private readonly runTracker?: IAnalysisRunTracker,
    private readonly fieldMemoContextProvider?: IFieldMemoContextProvider,
    private readonly podEvidenceProvider?: IPodEvidenceProvider
  ) {}

  /**
   * Resolves POD evidence for the whole analysis run's date range in one call, so per-document
   * and per-event lookups below are in-memory map reads rather than one query per delay event
   * (database-efficiency rule). Any failure is logged and treated as "no POD evidence" — POD is
   * an enhancement, never a dependency of analysis completing.
   */
  private async loadPodEvidenceByDate(
    projectId: string,
    tenantId: string,
    documents: Array<{ reportDate: Date | null }>
  ): Promise<Map<string, PodReport[]>> {
    if (!this.podEvidenceProvider) {
      return new Map();
    }
    const dates = documents.map(d => d.reportDate).filter((d): d is Date => d != null);
    if (dates.length === 0) {
      return new Map();
    }
    const startDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const endDate = new Date(Math.max(...dates.map(d => d.getTime())));
    try {
      const evidenceByDate = await this.podEvidenceProvider.getEvidenceForDateRange(projectId, tenantId, startDate, endDate);
      const totalSections = Array.from(evidenceByDate.values())
        .reduce((sum, reports) => sum + reports.reduce((s, r) => s + r.sections.length, 0), 0);
      console.log(`[RunAnalysisCommandHandler] POD evidence: ${evidenceByDate.size} date(s) with reports covering ${startDate.toISOString().split('T')[0]}..${endDate.toISOString().split('T')[0]} (${totalSections} sections total)`);
      return evidenceByDate;
    } catch (error) {
      console.warn('[RunAnalysisCommandHandler] Failed to load POD evidence for date range (continuing without it):', error);
      return new Map();
    }
  }

  private buildPodMatchEvidence(evidenceByDate: Map<string, PodReport[]>, date: Date | null): PodMatchEvidence | undefined {
    if (!date) return undefined;
    const reports = evidenceByDate.get(toPodEvidenceDateKey(date)) ?? [];
    if (reports.length === 0) return undefined;
    return { contextText: renderPodDayContext(reports), reports };
  }

  async execute(command: RunAnalysisCommand, options?: RunAnalysisOptions): Promise<RunAnalysisResult> {
    const baseProgress = options?.progressReporter || new NoOpProgressReporter();
    const runId = options?.runId || `run-${Date.now()}`;

    const progress = this.runTracker
      ? new TrackingProgressReporter(baseProgress, this.runTracker, runId)
      : baseProgress;

    if (this.runTracker) {
      this.runTracker.start(runId, command.projectId, command.tenantId);
    }

    try {
      const result = await this.executeInternal(command, options, progress);

      if (this.runTracker) {
        this.runTracker.complete(runId, result);
      }

      return result;
    } catch (error) {
      if (this.runTracker) {
        this.runTracker.fail(runId, error instanceof Error ? error.message : 'Unknown error');
      }
      throw error;
    }
  }

  private async executeInternal(
    command: RunAnalysisCommand,
    options: RunAnalysisOptions | undefined,
    progress: IProgressReporter,
  ): Promise<RunAnalysisResult> {
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
    // Resolved once for the whole run's date range and reused for every document/event below,
    // per the "load once per run, not per event" database-efficiency rule. Populated from
    // whichever set of documents is available first (extraction's fieldReports, or all project
    // documents if this run only matches).
    let podEvidenceByDate = new Map<string, PodReport[]>();
    // Records, per source document, whether POD evidence was actually available at extraction time.
    // Persisted onto each event's metadata so POD influence on a run is auditable afterwards rather
    // than only inferable from prompt logs.
    const podAuditByDocumentId = new Map<string, { podEvidenceAvailable: boolean; podReportCount: number; podSourceDocumentId: string | null }>();

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
          if (doc.documentType === 'field_memo' || doc.documentType === 'ncr') {
            return true;
          }
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

        let fieldMemoContext: string | null = null;
        if (this.fieldMemoContextProvider) {
          try {
            fieldMemoContext = await this.fieldMemoContextProvider.getConsolidatedContext(
              command.projectId,
              command.tenantId,
              command.filterMonth,
              command.filterYear
            );
            if (fieldMemoContext) {
              console.log(`[RunAnalysisCommandHandler] Field memo context loaded (${fieldMemoContext.length} chars)`);
            }
          } catch (error) {
            console.warn('[RunAnalysisCommandHandler] Failed to load field memo context:', error);
          }
        }

        podEvidenceByDate = await this.loadPodEvidenceByDate(command.projectId, command.tenantId, fieldReports);

        const allExtractedEvents: ExtractedEventWithSource[] = [];
        const successfulDocIds = new Set<string>();

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
            const docPodEvidence = this.buildPodMatchEvidence(podEvidenceByDate, doc.reportDate ?? null);
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
                fieldMemoContext: doc.documentType === 'idr' && fieldMemoContext ? fieldMemoContext : undefined,
                podContext: docPodEvidence?.contextText ?? undefined,
              }
            );

            successfulDocIds.add(doc.id);

            const reportDate = doc.reportDate ?? (doc.documentType === 'idr' 
              ? extractReportDateFromIDR(doc.rawContent!) 
              : null);
            const eventPodEvidence = reportDate === (doc.reportDate ?? null)
              ? docPodEvidence
              : this.buildPodMatchEvidence(podEvidenceByDate, reportDate);

            // Recorded against the *effective* report date (which may have been recovered from the
            // document body), so the audit agrees with the POD evidence matching later uses.
            // Only attribute a specific POD document here when exactly one report exists for the
            // date — with multiple reports, the actual corroborating report (if any) is only
            // known once matching runs, so naming "the first" would be misleading.
            const auditReports = eventPodEvidence?.reports ?? [];
            podAuditByDocumentId.set(doc.id, {
              podEvidenceAvailable: auditReports.length > 0,
              podReportCount: auditReports.length,
              podSourceDocumentId: auditReports.length === 1 ? auditReports[0].sourceDocumentId : null,
            });

            if (extractionResult.workActivities && extractionResult.workActivities.length > 0) {
              documentContexts.set(doc.id, {
                workActivities: extractionResult.workActivities,
                reportDate,
                podEvidence: eventPodEvidence,
              });
              const activityIds = extractionResult.workActivities.map(a => a.activityId).join(', ');
              const dateInfo = reportDate ? ` (${reportDate.toISOString().split('T')[0]})` : '';
              progress.report({
                stage: 'extracting_events',
                message: `Found activities: ${activityIds}${dateInfo}`,
                percentage: docProgress,
                details: { current: i + 1, total: fieldReports.length },
              });
            } else if (reportDate) {
              documentContexts.set(doc.id, {
                workActivities: [],
                reportDate,
                podEvidence: eventPodEvidence,
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

        // Period-scoped rerun retention: capture exactly which *pre-existing* events this run is
        // about to replace, by id, BEFORE saving anything new. Recording specific ids up front
        // (rather than a broad "document + period" predicate applied after saving) means the
        // deletion pass below can never catch the new events this same run is about to insert.
        // Scoped to exactly the documents that were *successfully* reprocessed above
        // (successfulDocIds) — a document that failed extraction keeps its prior events for this
        // period untouched, since there's nothing new to replace them with. When the run itself
        // is period-scoped (filterMonth/filterYear set), only that document's events in the
        // target month/year — plus its undated events, which can't be attributed to any period
        // and would otherwise accumulate a duplicate on every rerun — are captured; events from
        // that same document belonging to other periods are left out and survive untouched.
        // Unscoped runs keep the original "replace everything for this document" behavior.
        const staleEventIdsToClear: string[] = [];
        for (const docId of Array.from(successfulDocIds)) {
          const existingEvents = await this.eventRepository.findByDocumentId(docId, command.tenantId);
          for (const existing of existingEvents) {
            if (command.filterMonth !== undefined && command.filterYear !== undefined) {
              const d = existing.eventStartDate ? new Date(existing.eventStartDate) : null;
              const matchesTargetPeriod = d && !isNaN(d.getTime())
                && d.getMonth() + 1 === command.filterMonth
                && d.getFullYear() === command.filterYear;
              const isUndated = !existing.eventStartDate;
              if (matchesTargetPeriod || isUndated) {
                staleEventIdsToClear.push(existing.id);
              }
            } else {
              staleEventIdsToClear.push(existing.id);
            }
          }
        }

        progress.report({
          stage: 'deduplicating_events',
          message: `Deduplicating ${allExtractedEvents.length} extracted events...`,
          percentage: 42,
        });

        let deduplicatedEvents = this.deduplicationService.deduplicateWithSources(allExtractedEvents);

        const duplicatesRemoved = allExtractedEvents.length - deduplicatedEvents.length;
        if (duplicatesRemoved > 0) {
          progress.report({
            stage: 'deduplicating_events',
            message: `Removed ${duplicatesRemoved} duplicate events (same delay mentioned in multiple documents)`,
            percentage: 45,
          });
        }

        // Period-scoped runs only clear (and are only allowed to replace) each successfully
        // reprocessed document's events for the target month/year — never that document's events
        // from other periods (see the scoped clear above). Field memo/NCR documents are always
        // reprocessed regardless of period and can legitimately describe delays on dates outside
        // the target month/year; without this filter, re-extracting them on every period rerun
        // would persist a fresh duplicate of those out-of-period events on top of the ones an
        // earlier run already saved (which this run intentionally left untouched). So a
        // newly-extracted event is only saved when it has no determinable date (can't be period-
        // checked, so it's allowed through as before) or it falls within the target period;
        // anything else is dropped rather than saved as a duplicate outside this run's scope.
        if (command.filterMonth !== undefined && command.filterYear !== undefined) {
          const targetMonth = command.filterMonth;
          const targetYear = command.filterYear;
          const beforeFilterCount = deduplicatedEvents.length;
          deduplicatedEvents = deduplicatedEvents.filter(deduped => {
            if (!deduped.event.eventDate) return true;
            const d = new Date(deduped.event.eventDate);
            if (isNaN(d.getTime())) return true;
            return d.getMonth() + 1 === targetMonth && d.getFullYear() === targetYear;
          });
          const outOfPeriodDropped = beforeFilterCount - deduplicatedEvents.length;
          if (outOfPeriodDropped > 0) {
            console.log(`[RunAnalysisCommandHandler] Dropped ${outOfPeriodDropped} newly extracted event(s) dated outside the target period ${targetMonth}/${targetYear} to avoid duplicating prior runs' results for those periods`);
          }
        }

        progress.report({
          stage: 'saving_events',
          message: `Saving ${deduplicatedEvents.length} unique delay events...`,
          percentage: 47,
        });

        const preMatchedActivityCodes = new Set<string>();
        for (const deduped of deduplicatedEvents) {
          if (deduped.event.matchedActivityId && 
              deduped.event.matchConfidence !== undefined &&
              deduped.event.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100) {
            preMatchedActivityCodes.add(deduped.event.matchedActivityId);
          }
        }

        const activityCodeToUuidMap = new Map<string, string>();
        if (preMatchedActivityCodes.size > 0) {
          console.log(`[RunAnalysisCommandHandler] Looking up UUIDs for ${preMatchedActivityCodes.size} pre-matched activity codes`);
          for (const activityCode of Array.from(preMatchedActivityCodes)) {
            const activity = await this.scheduleRepository.findByActivityId(
              command.projectId,
              command.tenantId,
              activityCode
            );
            if (activity) {
              activityCodeToUuidMap.set(activityCode, activity.id);
              console.log(`[RunAnalysisCommandHandler] Mapped activity code "${activityCode}" -> UUID "${activity.id}"`);
            } else {
              console.log(`[RunAnalysisCommandHandler] WARNING: Activity code "${activityCode}" not found in schedule - will skip pre-match`);
            }
          }
        }

        let preMatchedCount = 0;
        let idrPolicyRejections = 0;
        const preMatchedEvents: ContractorDelayEvent[] = [];
        for (const deduped of deduplicatedEvents) {
          const now = new Date();
          const activityCode = deduped.event.matchedActivityId;
          const activityUuid = activityCode ? activityCodeToUuidMap.get(activityCode) : undefined;
          let hasPreMatch = activityCode && 
            activityUuid &&
            deduped.event.matchConfidence !== undefined &&
            deduped.event.matchConfidence >= MIN_MATCH_CONFIDENCE_FOR_SKIP / 100;
          
          let enforcedConfidence: number | undefined;
          if (hasPreMatch && this.idrMatchPolicy) {
            const docContext = documentContexts.get(deduped.primarySourceDocumentId);
            if (docContext && docContext.workActivities.length > 0) {
              const validation = this.idrMatchPolicy.validatePreMatch(
                activityCode!,
                Math.round(deduped.event.matchConfidence! * 100),
                docContext.workActivities
              );
              if (!validation.isValid) {
                console.log(`[RunAnalysisCommandHandler] IDR policy rejected pre-match: ${validation.reason}`);
                hasPreMatch = false;
                idrPolicyRejections++;
              } else if (validation.correctedConfidence !== undefined) {
                enforcedConfidence = validation.correctedConfidence;
                console.log(`[RunAnalysisCommandHandler] IDR policy enforced confidence floor: ${Math.round(deduped.event.matchConfidence! * 100)}% -> ${enforcedConfidence}%`);
              }
            }
          }

          const eventId = randomUUID();
          if (hasPreMatch) {
            preMatchedCount++;
          }

          const provenance = resolveDurationProvenance({
            rawBasis: deduped.event.durationBasis,
            rawWindowStart: deduped.event.impactedWindowStart,
            rawWindowEnd: deduped.event.impactedWindowEnd,
            rawImpactDurationHours: normalizeImpactDuration(deduped.event.impactDurationHours),
            eventStartDate: deduped.event.eventDate,
          });

          const event = new ContractorDelayEvent({
            id: eventId,
            projectId: command.projectId,
            tenantId: command.tenantId,
            sourceDocumentId: deduped.primarySourceDocumentId,
            matchedActivityId: hasPreMatch ? activityUuid! : null,
            wbs: hasPreMatch ? (deduped.event.matchedActivityWbs ?? null) : null,
            cpmActivityId: hasPreMatch ? activityCode! : null,
            cpmActivityDescription: hasPreMatch ? (deduped.event.matchedActivityDescription ?? null) : null,
            eventDescription: deduped.event.eventDescription,
            eventCategory: deduped.event.eventCategory,
            eventStartDate: deduped.event.eventDate,
            eventFinishDate: provenance.eventFinishDate,
            impactDurationHours: provenance.impactDurationHours,
            impactedWindowStart: provenance.windowStart,
            impactedWindowEnd: provenance.windowEnd,
            durationBasis: provenance.durationBasis,
            sourceReference: deduped.event.sourceReference,
            extractedFromCode: deduped.event.extractedFromCode,
            matchConfidence: hasPreMatch ? (enforcedConfidence ?? Math.round(deduped.event.matchConfidence! * 100)) : null,
            matchReasoning: hasPreMatch ? (deduped.event.matchReasoning ?? '[Pre-matched during extraction]') : null,
            delayEventConfidence: deduped.event.delayEventConfidence 
              ? Math.round(deduped.event.delayEventConfidence * 100) 
              : null,
            verificationStatus: 'pending',
            verifiedBy: null,
            verifiedAt: null,
            metadata: buildEventMetadata(
              deduped.sourceDocumentIds,
              podAuditByDocumentId.get(deduped.primarySourceDocumentId ?? ''),
              provenance.rejectedBoundedClaimNote
            ),
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

        // Period-scoped rerun retention: the exact pre-existing events captured by id above
        // (staleEventIdsToClear) are only deleted AFTER every newly extracted/deduplicated event
        // has been saved successfully. If saving throws partway through (DB error, etc.),
        // execution never reaches this block, so a failed rerun can produce transient duplicates
        // at worst — it can never delete prior results without having successfully persisted
        // their replacements first. Deleting by the ids captured before any new event was saved
        // (rather than re-applying a document/period predicate now) also guarantees this pass
        // can never catch the new events just inserted above.
        if (staleEventIdsToClear.length > 0) {
          for (const staleId of staleEventIdsToClear) {
            await this.eventRepository.delete(staleId, command.tenantId);
          }
          console.log(`[RunAnalysisCommandHandler] Cleared ${staleEventIdsToClear.length} previous events from ${successfulDocIds.size} successfully re-processed documents`);
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

        if (idrPolicyRejections > 0) {
          console.log(`[RunAnalysisCommandHandler] IDR enforcement policy rejected ${idrPolicyRejections} pre-matches (matched to non-IDR activities). These events will be re-matched via the strict IDR matcher.`);
          progress.report({
            stage: 'saving_events',
            message: `${idrPolicyRejections} pre-matches corrected by IDR enforcement policy`,
            percentage: 47,
          });
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

        // Match-only runs (extraction skipped) never populated podEvidenceByDate above —
        // resolve it here instead, still once for the whole run rather than per event.
        if (!shouldExtract && podEvidenceByDate.size === 0) {
          podEvidenceByDate = await this.loadPodEvidenceByDate(command.projectId, command.tenantId, allDocs);
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
              const docContext = event.sourceDocumentId 
                ? documentContexts.get(event.sourceDocumentId)
                : undefined;

              const fallbackReportDate = docContext?.reportDate
                ?? (event.sourceDocumentId ? allDocumentReportDates.get(event.sourceDocumentId) : undefined)
                ?? event.eventStartDate
                ?? undefined;
              const podEvidence = docContext?.podEvidence
                ?? this.buildPodMatchEvidence(podEvidenceByDate, fallbackReportDate ?? null);

              const matchResult = await this.matcher.matchEventToActivities(
                event.eventDescription,
                event.eventStartDate,
                activities,
                { 
                  runId: options?.runId, 
                  onTokenUsage: options?.onTokenUsage,
                  idrWorkActivities: docContext?.workActivities,
                  reportDate: docContext?.reportDate ?? undefined,
                  podEvidence,
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
