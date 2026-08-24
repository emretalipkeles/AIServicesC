import type { ListDelayEventsQuery } from '../ListDelayEventsQuery';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { ContractorDelayEvent, DelayEventCategory, VerificationStatus } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface DelayEventDto {
  id: string;
  sourceDocumentId: string | null;
  sourceDocumentType: string | null;
  matchedActivityId: string | null;
  wbs: string | null;
  cpmActivityId: string | null;
  cpmActivityDescription: string | null;
  isCriticalPath: string | null;
  totalFloat: number | null;
  eventDescription: string;
  eventCategory: DelayEventCategory | null;
  eventStartDate: string | null;
  eventFinishDate: string | null;
  impactDurationHours: number | null;
  impactedWindowStart: string | null;
  impactedWindowEnd: string | null;
  durationBasis: string | null;
  sourceReference: string | null;
  extractedFromCode: string | null;
  matchConfidence: number | null;
  matchReasoning: string | null;
  delayEventConfidence: number | null;
  verificationStatus: VerificationStatus;
  createdAt: string;
  /** Resolved filename of the POD document that informed this event, if any (nullable — older events have none). */
  podDocumentName: string | null;
  /** Short plain-language note on how POD evidence was actually used for this event/match. */
  podUsageNote: string | null;
  /** Set when a claimed 'bounded_by_next_entry' duration was rejected and capped; explains why. */
  rejectedBoundedClaimNote: string | null;
}

export class ListDelayEventsQueryHandler {
  constructor(
    private readonly eventRepository: IContractorDelayEventRepository,
    private readonly scheduleActivityRepository?: IScheduleActivityRepository,
    private readonly documentRepository?: IProjectDocumentRepository
  ) {}

  async execute(query: ListDelayEventsQuery): Promise<DelayEventDto[]> {
    const events = await this.eventRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    const [activityDataMap, documentMaps] = await Promise.all([
      this.fetchActivityData(events, query.projectId, query.tenantId),
      this.fetchDocumentMaps(events, query.projectId, query.tenantId),
    ]);
    const { typeMap: documentTypeMap, filenameMap: documentFilenameMap } = documentMaps;

    const filtered = this.applyDateFilter(events, documentTypeMap, query.filterMonth, query.filterYear);

    return filtered.map(event => this.mapToDto(event, activityDataMap, documentTypeMap, documentFilenameMap));
  }

  private applyDateFilter(
    events: ContractorDelayEvent[],
    documentTypeMap: Map<string, string>,
    filterMonth?: number,
    filterYear?: number
  ): ContractorDelayEvent[] {
    if (filterMonth === undefined || filterYear === undefined) {
      return events;
    }

    return events.filter(event => {
      const docType = event.sourceDocumentId
        ? documentTypeMap.get(event.sourceDocumentId) ?? null
        : null;

      if (docType === 'field_memo' || docType === 'ncr') {
        return true;
      }

      if (!event.eventStartDate) {
        return false;
      }

      const d = new Date(event.eventStartDate);
      return d.getMonth() + 1 === filterMonth && d.getFullYear() === filterYear;
    });
  }

  private async fetchActivityData(
    events: ContractorDelayEvent[],
    _projectId: string,
    tenantId: string
  ): Promise<Map<string, { isCriticalPath: string; totalFloat: number | null }>> {
    const activityDataMap = new Map<string, { isCriticalPath: string; totalFloat: number | null }>();
    
    if (!this.scheduleActivityRepository) {
      return activityDataMap;
    }

    const matchedActivityIds = events
      .map(e => e.matchedActivityId)
      .filter((id): id is string => id !== null);

    if (matchedActivityIds.length === 0) {
      return activityDataMap;
    }

    const uniqueActivityIds = Array.from(new Set(matchedActivityIds));
    const activities = await this.scheduleActivityRepository.findByIds(uniqueActivityIds, tenantId);

    for (const activity of activities) {
      activityDataMap.set(activity.id, {
        isCriticalPath: activity.isCriticalPath,
        totalFloat: activity.totalFloat,
      });
    }

    return activityDataMap;
  }

  /**
   * Resolves both document type (used for date-filter exemptions) and filename (used to
   * surface which POD document informed an event) from the same document list, the same way
   * `sourceDocumentType` has always been resolved — a `podSourceDocumentId` on an event's
   * metadata is just another document id to resolve through this map.
   */
  private async fetchDocumentMaps(
    events: ContractorDelayEvent[],
    projectId: string,
    tenantId: string
  ): Promise<{ typeMap: Map<string, string>; filenameMap: Map<string, string> }> {
    const typeMap = new Map<string, string>();
    const filenameMap = new Map<string, string>();

    if (!this.documentRepository) {
      return { typeMap, filenameMap };
    }

    const hasAnySourceDoc = events.some(e => e.sourceDocumentId !== null)
      || events.some(e => typeof e.metadata?.podSourceDocumentId === 'string');

    if (!hasAnySourceDoc) {
      return { typeMap, filenameMap };
    }

    const documents = await this.documentRepository.findByProjectId(projectId, tenantId);

    for (const doc of documents) {
      typeMap.set(doc.id, doc.documentType);
      filenameMap.set(doc.id, doc.filename);
    }

    return { typeMap, filenameMap };
  }

  private mapToDto(
    event: ContractorDelayEvent,
    activityDataMap: Map<string, { isCriticalPath: string; totalFloat: number | null }>,
    documentTypeMap: Map<string, string>,
    documentFilenameMap: Map<string, string>
  ): DelayEventDto {
    const activityData = event.matchedActivityId 
      ? activityDataMap.get(event.matchedActivityId) 
      : null;

    const podSourceDocumentId = typeof event.metadata?.podSourceDocumentId === 'string'
      ? event.metadata.podSourceDocumentId
      : null;
    const podUsageNote = typeof event.metadata?.podUsageNote === 'string'
      ? event.metadata.podUsageNote
      : null;
    const rejectedBoundedClaimNote = typeof event.metadata?.rejectedBoundedClaimNote === 'string'
      ? event.metadata.rejectedBoundedClaimNote
      : null;

    return {
      id: event.id,
      sourceDocumentId: event.sourceDocumentId,
      sourceDocumentType: event.sourceDocumentId ? documentTypeMap.get(event.sourceDocumentId) ?? null : null,
      matchedActivityId: event.matchedActivityId,
      wbs: event.wbs,
      cpmActivityId: event.cpmActivityId,
      cpmActivityDescription: event.cpmActivityDescription,
      isCriticalPath: activityData?.isCriticalPath ?? null,
      totalFloat: activityData?.totalFloat ?? null,
      eventDescription: event.eventDescription,
      eventCategory: event.eventCategory,
      eventStartDate: event.eventStartDate?.toISOString() ?? null,
      eventFinishDate: event.eventFinishDate?.toISOString() ?? null,
      impactDurationHours: event.impactDurationHours,
      impactedWindowStart: event.impactedWindowStart,
      impactedWindowEnd: event.impactedWindowEnd,
      durationBasis: event.durationBasis,
      sourceReference: event.sourceReference,
      extractedFromCode: event.extractedFromCode,
      matchConfidence: event.matchConfidence,
      matchReasoning: event.matchReasoning,
      delayEventConfidence: event.delayEventConfidence,
      verificationStatus: event.verificationStatus,
      createdAt: event.createdAt.toISOString(),
      podDocumentName: podSourceDocumentId ? documentFilenameMap.get(podSourceDocumentId) ?? null : null,
      podUsageNote,
      rejectedBoundedClaimNote,
    };
  }
}
