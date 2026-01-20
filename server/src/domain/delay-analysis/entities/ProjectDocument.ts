export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'other';
export type DocumentProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProjectDocumentProps {
  id: string;
  projectId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  documentType: ProjectDocumentType;
  rawContent?: string | null;
  reportDate?: Date | null;
  status: DocumentProcessingStatus;
  errorMessage?: string | null;
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
  readonly rawContent: string | null;
  readonly reportDate: Date | null;
  readonly status: DocumentProcessingStatus;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ProjectDocumentProps) {
    this.id = props.id;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.filename = props.filename;
    this.contentType = props.contentType;
    this.documentType = props.documentType;
    this.rawContent = props.rawContent ?? null;
    this.reportDate = props.reportDate ?? null;
    this.status = props.status;
    this.errorMessage = props.errorMessage ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  isFieldReport(): boolean {
    return this.documentType === 'idr' || this.documentType === 'ncr' || this.documentType === 'field_memo';
  }

  isSchedule(): boolean {
    return this.documentType === 'cpm_schedule';
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
}
