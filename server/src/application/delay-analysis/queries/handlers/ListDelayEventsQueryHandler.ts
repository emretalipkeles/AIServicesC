import type { ListDelayEventsQuery } from '../ListDelayEventsQuery';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { ContractorDelayEvent, DelayEventCategory, VerificationStatus } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface DelayEventDto {
  id: string;
  sourceDocumentId: string | null;
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
  sourceReference: string | null;
  extractedFromCode: string | null;
  matchConfidence: number | null;
  matchReasoning: string | null;
  verificationStatus: VerificationStatus;
  createdAt: string;
}

export class ListDelayEventsQueryHandler {
  constructor(
    private readonly eventRepository: IContractorDelayEventRepository,
    private readonly scheduleActivityRepository?: IScheduleActivityRepository
  ) {}

  async execute(query: ListDelayEventsQuery): Promise<DelayEventDto[]> {
    const events = await this.eventRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    const activityDataMap = await this.fetchActivityData(events, query.projectId, query.tenantId);

    return events.map(event => this.mapToDto(event, activityDataMap));
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

    for (const activityId of matchedActivityIds) {
      const activity = await this.scheduleActivityRepository.findById(activityId, tenantId);
      if (activity) {
        activityDataMap.set(activityId, {
          isCriticalPath: activity.isCriticalPath,
          totalFloat: activity.totalFloat,
        });
      }
    }

    return activityDataMap;
  }

  private mapToDto(
    event: ContractorDelayEvent,
    activityDataMap: Map<string, { isCriticalPath: string; totalFloat: number | null }>
  ): DelayEventDto {
    const activityData = event.matchedActivityId 
      ? activityDataMap.get(event.matchedActivityId) 
      : null;

    return {
      id: event.id,
      sourceDocumentId: event.sourceDocumentId,
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
      sourceReference: event.sourceReference,
      extractedFromCode: event.extractedFromCode,
      matchConfidence: event.matchConfidence,
      matchReasoning: event.matchReasoning,
      verificationStatus: event.verificationStatus,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
