import type { GetDelayEventsByDocumentQuery } from '../GetDelayEventsByDocumentQuery';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import type { DelayEventCategory, VerificationStatus } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';

export interface DelayEventByDocumentDto {
  id: string;
  eventDescription: string;
  eventCategory: DelayEventCategory | null;
  impactDurationHours: number | null;
  delayEventConfidence: number | null;
  matchConfidence: number | null;
  matchReasoning: string | null;
  sourceReference: string | null;
  cpmActivityId: string | null;
  cpmActivityDescription: string | null;
  verificationStatus: VerificationStatus;
}

export class GetDelayEventsByDocumentQueryHandler {
  constructor(
    private readonly delayEventRepository: IContractorDelayEventRepository
  ) {}

  async execute(query: GetDelayEventsByDocumentQuery): Promise<DelayEventByDocumentDto[]> {
    const events = await this.delayEventRepository.findByDocumentId(
      query.documentId,
      query.tenantId
    );

    const projectScopedEvents = events.filter(e => e.projectId === query.projectId);

    return projectScopedEvents.map(event => ({
      id: event.id,
      eventDescription: event.eventDescription,
      eventCategory: event.eventCategory,
      impactDurationHours: event.impactDurationHours,
      delayEventConfidence: event.delayEventConfidence,
      matchConfidence: event.matchConfidence,
      matchReasoning: event.matchReasoning,
      sourceReference: event.sourceReference,
      cpmActivityId: event.cpmActivityId,
      cpmActivityDescription: event.cpmActivityDescription,
      verificationStatus: event.verificationStatus,
    }));
  }
}
