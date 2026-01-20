export interface DelayAnalysisProjectProps {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  contractNumber?: string | null;
  noticeToProceedDate?: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class DelayAnalysisProject {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly contractNumber: string | null;
  readonly noticeToProceedDate: Date | null;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: DelayAnalysisProjectProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description ?? null;
    this.contractNumber = props.contractNumber ?? null;
    this.noticeToProceedDate = props.noticeToProceedDate ?? null;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.validate();
  }

  private validate(): void {
    if (!this.name || this.name.trim().length < 2) {
      throw new Error('Project name must be at least 2 characters');
    }
  }

  isActive(): boolean {
    return this.status === 'active';
  }

  withUpdatedStatus(status: string): DelayAnalysisProject {
    return new DelayAnalysisProject({
      ...this,
      status,
      updatedAt: new Date(),
    });
  }

  withUpdatedDescription(description: string): DelayAnalysisProject {
    return new DelayAnalysisProject({
      ...this,
      description,
      updatedAt: new Date(),
    });
  }
}
