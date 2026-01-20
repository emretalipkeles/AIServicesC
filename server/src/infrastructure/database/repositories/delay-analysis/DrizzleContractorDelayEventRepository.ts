import { eq, and, isNull } from 'drizzle-orm';
import type { IContractorDelayEventRepository } from '../../../../domain/delay-analysis/repositories/IContractorDelayEventRepository';
import { ContractorDelayEvent, type DelayEventCategory, type VerificationStatus } from '../../../../domain/delay-analysis/entities/ContractorDelayEvent';
import { contractorDelayEvents } from '@shared/schema';
import { db } from '../../../database';

export class DrizzleContractorDelayEventRepository implements IContractorDelayEventRepository {
  async findById(id: string, tenantId: string): Promise<ContractorDelayEvent | null> {
    const result = await db
      .select()
      .from(contractorDelayEvents)
      .where(and(eq(contractorDelayEvents.id, id), eq(contractorDelayEvents.tenantId, tenantId)))
      .limit(1);

    if (result.length === 0) return null;

    return this.mapRowToEntity(result[0]);
  }

  async findByProjectId(projectId: string, tenantId: string): Promise<ContractorDelayEvent[]> {
    const result = await db
      .select()
      .from(contractorDelayEvents)
      .where(and(
        eq(contractorDelayEvents.projectId, projectId), 
        eq(contractorDelayEvents.tenantId, tenantId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByDocumentId(documentId: string, tenantId: string): Promise<ContractorDelayEvent[]> {
    const result = await db
      .select()
      .from(contractorDelayEvents)
      .where(and(
        eq(contractorDelayEvents.sourceDocumentId, documentId), 
        eq(contractorDelayEvents.tenantId, tenantId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findByVerificationStatus(
    projectId: string, 
    tenantId: string, 
    status: VerificationStatus
  ): Promise<ContractorDelayEvent[]> {
    const result = await db
      .select()
      .from(contractorDelayEvents)
      .where(and(
        eq(contractorDelayEvents.projectId, projectId),
        eq(contractorDelayEvents.tenantId, tenantId),
        eq(contractorDelayEvents.verificationStatus, status)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async findUnmatched(projectId: string, tenantId: string): Promise<ContractorDelayEvent[]> {
    const result = await db
      .select()
      .from(contractorDelayEvents)
      .where(and(
        eq(contractorDelayEvents.projectId, projectId),
        eq(contractorDelayEvents.tenantId, tenantId),
        isNull(contractorDelayEvents.matchedActivityId)
      ));

    return result.map(row => this.mapRowToEntity(row));
  }

  async save(event: ContractorDelayEvent): Promise<void> {
    await db.insert(contractorDelayEvents).values({
      id: event.id,
      projectId: event.projectId,
      tenantId: event.tenantId,
      sourceDocumentId: event.sourceDocumentId,
      matchedActivityId: event.matchedActivityId,
      wbs: event.wbs,
      cpmActivityId: event.cpmActivityId,
      cpmActivityDescription: event.cpmActivityDescription,
      eventDescription: event.eventDescription,
      eventCategory: event.eventCategory,
      eventStartDate: event.eventStartDate,
      eventFinishDate: event.eventFinishDate,
      impactDurationHours: event.impactDurationHours,
      sourceReference: event.sourceReference,
      extractedFromCode: event.extractedFromCode,
      matchConfidence: event.matchConfidence,
      matchReasoning: event.matchReasoning,
      verificationStatus: event.verificationStatus,
      verifiedBy: event.verifiedBy,
      verifiedAt: event.verifiedAt,
      metadata: event.metadata,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });
  }

  async saveBatch(events: ContractorDelayEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    await db.insert(contractorDelayEvents).values(
      events.map(event => ({
        id: event.id,
        projectId: event.projectId,
        tenantId: event.tenantId,
        sourceDocumentId: event.sourceDocumentId,
        matchedActivityId: event.matchedActivityId,
        wbs: event.wbs,
        cpmActivityId: event.cpmActivityId,
        cpmActivityDescription: event.cpmActivityDescription,
        eventDescription: event.eventDescription,
        eventCategory: event.eventCategory,
        eventStartDate: event.eventStartDate,
        eventFinishDate: event.eventFinishDate,
        impactDurationHours: event.impactDurationHours,
        sourceReference: event.sourceReference,
        extractedFromCode: event.extractedFromCode,
        matchConfidence: event.matchConfidence,
        matchReasoning: event.matchReasoning,
        verificationStatus: event.verificationStatus,
        verifiedBy: event.verifiedBy,
        verifiedAt: event.verifiedAt,
        metadata: event.metadata,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      }))
    );
  }

  async update(event: ContractorDelayEvent): Promise<void> {
    await db
      .update(contractorDelayEvents)
      .set({
        matchedActivityId: event.matchedActivityId,
        wbs: event.wbs,
        cpmActivityId: event.cpmActivityId,
        cpmActivityDescription: event.cpmActivityDescription,
        eventDescription: event.eventDescription,
        eventCategory: event.eventCategory,
        eventStartDate: event.eventStartDate,
        eventFinishDate: event.eventFinishDate,
        impactDurationHours: event.impactDurationHours,
        matchConfidence: event.matchConfidence,
        matchReasoning: event.matchReasoning,
        verificationStatus: event.verificationStatus,
        verifiedBy: event.verifiedBy,
        verifiedAt: event.verifiedAt,
        metadata: event.metadata,
        updatedAt: event.updatedAt,
      })
      .where(and(
        eq(contractorDelayEvents.id, event.id), 
        eq(contractorDelayEvents.tenantId, event.tenantId)
      ));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await db
      .delete(contractorDelayEvents)
      .where(and(eq(contractorDelayEvents.id, id), eq(contractorDelayEvents.tenantId, tenantId)));
  }

  async deleteByDocumentId(documentId: string, tenantId: string): Promise<void> {
    await db
      .delete(contractorDelayEvents)
      .where(and(
        eq(contractorDelayEvents.sourceDocumentId, documentId), 
        eq(contractorDelayEvents.tenantId, tenantId)
      ));
  }

  private mapRowToEntity(row: typeof contractorDelayEvents.$inferSelect): ContractorDelayEvent {
    return new ContractorDelayEvent({
      id: row.id,
      projectId: row.projectId,
      tenantId: row.tenantId,
      sourceDocumentId: row.sourceDocumentId,
      matchedActivityId: row.matchedActivityId,
      wbs: row.wbs,
      cpmActivityId: row.cpmActivityId,
      cpmActivityDescription: row.cpmActivityDescription,
      eventDescription: row.eventDescription,
      eventCategory: row.eventCategory as DelayEventCategory | null,
      eventStartDate: row.eventStartDate,
      eventFinishDate: row.eventFinishDate,
      impactDurationHours: row.impactDurationHours,
      sourceReference: row.sourceReference,
      extractedFromCode: row.extractedFromCode,
      matchConfidence: row.matchConfidence,
      matchReasoning: row.matchReasoning,
      verificationStatus: row.verificationStatus as VerificationStatus,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt,
      metadata: row.metadata as Record<string, unknown> | null,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    });
  }
}
