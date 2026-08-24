export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'pod' | 'daily_report' | 'other';
export type DocumentProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProjectDocumentProps {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  documentType: ProjectDocumentType;
  contentHash?: string | null;
  rawContent?: string | null;
  reportDate?: Date | null;
  status: DocumentProcessingStatus;
  errorMessage?: string | null;
  structuredExtractionStatus?: 'completed' | 'failed' | null;
  structuredExtractionError?: string | null;
  structuredExtractionSummary?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ProjectDocument {
  readonly id: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly documentType: ProjectDocumentType;
  readonly contentHash: string | null;
  readonly rawContent: string | null;
  readonly reportDate: Date | null;
  readonly status: DocumentProcessingStatus;
  readonly errorMessage: string | null;
  readonly structuredExtractionStatus: 'completed' | 'failed' | null;
  readonly structuredExtractionError: string | null;
  readonly structuredExtractionSummary: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProjectDocumentProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.filename = props.filename;
    this.contentType = props.contentType;
    this.documentType = props.documentType;
    this.contentHash = props.contentHash ?? null;
    this.rawContent = props.rawContent ?? null;
    this.reportDate = props.reportDate ?? null;
    this.status = props.status;
    this.errorMessage = props.errorMessage ?? null;
    this.structuredExtractionStatus = props.structuredExtractionStatus ?? null;
    this.structuredExtractionError = props.structuredExtractionError ?? null;
    this.structuredExtractionSummary = props.structuredExtractionSummary ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.validate();
  }

  private validate(): void {
    if (!this.filename || this.filename.trim().length === 0) {
      throw new Error('Document filename is required');
    }
    if (!this.projectId || this.projectId.trim().length === 0) {
      throw new Error('Project ID is required');
    }
  }

  isFieldReport(): boolean {
    return this.documentType === 'idr' || this.documentType === 'ncr' || this.documentType === 'field_memo';
  }

  isSchedule(): boolean {
    return this.documentType === 'cpm_schedule';
  }

  /**
   * Supporting/field-context documents (POD, Foreman Diaries) are never routed into
   * delay-event extraction; they only ever enrich extraction from field reports.
   */
  isSupportingContext(): boolean {
    return this.documentType === 'pod' || this.documentType === 'daily_report';
  }

  withProcessingStatus(status: DocumentProcessingStatus, errorMessage?: string): ProjectDocument {
    return new ProjectDocument({
      ...this,
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    });
  }

  withRawContent(rawContent: string): ProjectDocument {
    return new ProjectDocument({
      ...this,
      rawContent,
      updatedAt: new Date(),
    });
  }

  withContentHash(contentHash: string): ProjectDocument {
    return new ProjectDocument({
      ...this,
      contentHash,
      updatedAt: new Date(),
    });
  }

  withReportDate(reportDate: Date | null): ProjectDocument {
    return new ProjectDocument({
      ...this,
      reportDate,
      updatedAt: new Date(),
    });
  }

  withStructuredExtractionStatus(
    structuredExtractionStatus: 'completed' | 'failed',
    structuredExtractionError?: string,
    structuredExtractionSummary?: string
  ): ProjectDocument {
    return new ProjectDocument({
      ...this,
      structuredExtractionStatus,
      structuredExtractionError: structuredExtractionError ?? null,
      structuredExtractionSummary: structuredExtractionSummary ?? null,
      updatedAt: new Date(),
    });
  }
}
