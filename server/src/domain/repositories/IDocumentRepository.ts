import type { Document, DocumentStatus } from '../entities/Document';

export interface IDocumentRepository {
  findById(id: string, tenantId: string): Promise<Document | null>;
  findByAgentId(agentId: string, tenantId: string): Promise<Document[]>;
  save(document: Document): Promise<void>;
  updateStatus(id: string, tenantId: string, status: DocumentStatus, errorMessage?: string): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
  deleteByAgentId(agentId: string, tenantId: string): Promise<void>;
}
