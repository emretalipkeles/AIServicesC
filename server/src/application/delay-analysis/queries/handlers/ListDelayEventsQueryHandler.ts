import type { ListDelayEventsQuery } from '../ListDelayEventsQuery';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { ContractorDelayEvent, DelayEventCategory, VerificationStatus } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface DelayEventDto {
  id: string;
  sourceDocumentId: string | null;
  matchedActivityId: string | null;
  wbs: string | null;
  cpmActivityId: string | null;
  cpmActivityDescription: string | null;
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
  constructor(private readonly eventRepository: IContractorDelayEventRepository) {}

  async execute(query: ListDelayEventsQuery): Promise<DelayEventDto[]> {
    const events = await this.eventRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    return events.map(this.mapToDto);
  }

  private mapToDto(event: ContractorDelayEvent): DelayEventDto {
    return {
      id: event.id,
      sourceDocumentId: event.sourceDocumentId,
      matchedActivityId: event.matchedActivityId,
      wbs: event.wbs,
      cpmActivityId: event.cpmActivityId,
      cpmActivityDescription: event.cpmActivityDescription,
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
