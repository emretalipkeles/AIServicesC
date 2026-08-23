export type DelayEventCategory = 
  | 'planning_mobilization'
  | 'labor_related'
  | 'materials_equipment'
  | 'subcontractor_coordination'
  | 'quality_rework'
  | 'site_management_safety'
  | 'utility_infrastructure'
  | 'other';

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'needs_review';

/**
 * How impactDurationHours was actually derived, so downstream UI can distinguish a
 * timestamp-calculated figure from a document-stated figure or an AI estimate.
 */
export type DurationBasis = 'timestamp_derived' | 'document_stated' | 'estimated';

export interface ContractorDelayEventProps {
  id: string;
  projectId: string;
  tenantId: string;
  sourceDocumentId?: string | null;
  matchedActivityId?: string | null;
  wbs?: string | null;
  cpmActivityId?: string | null;
  cpmActivityDescription?: string | null;
  eventDescription: string;
  eventCategory?: DelayEventCategory | null;
  eventStartDate?: Date | null;
  eventFinishDate?: Date | null;
  impactDurationHours?: number | null;
  /** Impacted window clock times (e.g. "08:00"), when the source narrative supports them. */
  impactedWindowStart?: string | null;
  impactedWindowEnd?: string | null;
  /** How impactDurationHours was derived; null for events analyzed before this field existed. */
  durationBasis?: DurationBasis | null;
  sourceReference?: string | null;
  extractedFromCode?: string | null;
  matchConfidence?: number | null;
  matchReasoning?: string | null;
  delayEventConfidence?: number | null;
  verificationStatus: VerificationStatus;
  verifiedBy?: string | null;
  verifiedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ContractorDelayEvent {
  readonly id: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly sourceDocumentId: string | null;
  readonly matchedActivityId: string | null;
  readonly wbs: string | null;
  readonly cpmActivityId: string | null;
  readonly cpmActivityDescription: string | null;
  readonly eventDescription: string;
  readonly eventCategory: DelayEventCategory | null;
  readonly eventStartDate: Date | null;
  readonly eventFinishDate: Date | null;
  readonly impactDurationHours: number | null;
  readonly impactedWindowStart: string | null;
  readonly impactedWindowEnd: string | null;
  readonly durationBasis: DurationBasis | null;
  readonly sourceReference: string | null;
  readonly extractedFromCode: string | null;
  readonly matchConfidence: number | null;
  readonly matchReasoning: string | null;
  readonly delayEventConfidence: number | null;
  readonly verificationStatus: VerificationStatus;
  readonly verifiedBy: string | null;
  readonly verifiedAt: Date | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ContractorDelayEventProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.sourceDocumentId = props.sourceDocumentId ?? null;
    this.matchedActivityId = props.matchedActivityId ?? null;
    this.wbs = props.wbs ?? null;
    this.cpmActivityId = props.cpmActivityId ?? null;
    this.cpmActivityDescription = props.cpmActivityDescription ?? null;
    this.eventDescription = props.eventDescription;
    this.eventCategory = props.eventCategory ?? null;
    this.eventStartDate = props.eventStartDate ?? null;
    this.eventFinishDate = props.eventFinishDate ?? null;
    this.impactDurationHours = props.impactDurationHours ?? null;
    this.impactedWindowStart = props.impactedWindowStart ?? null;
    this.impactedWindowEnd = props.impactedWindowEnd ?? null;
    this.durationBasis = props.durationBasis ?? null;
    this.sourceReference = props.sourceReference ?? null;
    this.extractedFromCode = props.extractedFromCode ?? null;
    this.matchConfidence = props.matchConfidence ?? null;
    this.matchReasoning = props.matchReasoning ?? null;
    this.delayEventConfidence = props.delayEventConfidence ?? null;
    this.verificationStatus = props.verificationStatus;
    this.verifiedBy = props.verifiedBy ?? null;
    this.verifiedAt = props.verifiedAt ?? null;
    this.metadata = props.metadata ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  isVerified(): boolean {
    return this.verificationStatus === 'verified';
  }

  isPending(): boolean {
    return this.verificationStatus === 'pending';
  }

  hasHighConfidence(): boolean {
    return (this.matchConfidence ?? 0) >= 80;
  }

  getEventDurationDays(): number | null {
    if (!this.eventStartDate || !this.eventFinishDate) return null;
    const diffMs = this.eventFinishDate.getTime() - this.eventStartDate.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  withVerification(verifiedBy: string, status: VerificationStatus): ContractorDelayEvent {
    return new ContractorDelayEvent({
      ...this,
      verificationStatus: status,
      verifiedBy,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    });
  }

  withActivityMatch(
    matchedActivityId: string,
    cpmActivityId: string,
    cpmActivityDescription: string,
    wbs: string | null,
    confidence: number,
    reasoning: string,
    /**
     * Merged into existing metadata (never replaces it) so callers can layer in traceability
     * markers — e.g. `{ podCorroborated: true }` — without new columns.
     */
    metadataPatch?: Record<string, unknown>
  ): ContractorDelayEvent {
    return new ContractorDelayEvent({
      ...this,
      matchedActivityId,
      cpmActivityId,
      cpmActivityDescription,
      wbs,
      matchConfidence: confidence,
      matchReasoning: reasoning,
      metadata: metadataPatch ? { ...(this.metadata ?? {}), ...metadataPatch } : this.metadata,
      updatedAt: new Date(),
    });
  }

  clearActivityMatch(): ContractorDelayEvent {
    return new ContractorDelayEvent({
      ...this,
      matchedActivityId: null,
      cpmActivityId: null,
      cpmActivityDescription: null,
      wbs: null,
      matchConfidence: null,
      matchReasoning: null,
      updatedAt: new Date(),
    });
  }
}
