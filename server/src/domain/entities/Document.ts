export type DocumentStatus = 'pending' | 'processing' | 'indexed' | 'failed';

export interface DocumentProps {
  id: string;
  agentId: string;
  tenantId: string;
  filename: string;
  contentType: string;
  rawContent: string | null;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Document {
  readonly id: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly rawContent: string | null;
  readonly status: DocumentStatus;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: DocumentProps) {
    this.id = props.id;
    this.agentId = props.agentId;
    this.tenantId = props.tenantId;
    this.filename = props.filename;
    this.contentType = props.contentType;
    this.rawContent = props.rawContent;
    this.status = props.status;
    this.errorMessage = props.errorMessage;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  withStatus(status: DocumentStatus, errorMessage?: string): Document {
    return new Document({
      ...this,
      status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    });
  }

  isPending(): boolean {
    return this.status === 'pending';
  }

  isIndexed(): boolean {
    return this.status === 'indexed';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }
}
