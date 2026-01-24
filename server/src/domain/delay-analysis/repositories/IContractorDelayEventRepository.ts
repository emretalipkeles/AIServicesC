import type { ContractorDelayEvent, VerificationStatus } from '../entities/ContractorDelayEvent';

export interface IContractorDelayEventRepository {
  findById(id: string, tenantId: string): Promise<ContractorDelayEvent | null>;
  findByProjectId(projectId: string, tenantId: string): Promise<ContractorDelayEvent[]>;
  findByDocumentId(documentId: string, tenantId: string): Promise<ContractorDelayEvent[]>;
  findByVerificationStatus(projectId: string, tenantId: string, status: VerificationStatus): Promise<ContractorDelayEvent[]>;
  findUnmatched(projectId: string, tenantId: string): Promise<ContractorDelayEvent[]>;
  save(event: ContractorDelayEvent): Promise<void>;
  saveBatch(events: ContractorDelayEvent[]): Promise<void>;
  update(event: ContractorDelayEvent): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  deleteByDocumentId(documentId: string, tenantId: string): Promise<void>;
  deleteByProjectId(projectId: string, tenantId: string): Promise<number>;
}
