import type { IQueryHandler } from '../../interfaces/IQueryBus';
import type { ListAgentDocumentsQuery } from '../ListAgentDocumentsQuery';
import type { IDocumentRepository } from '../../../domain/repositories/IDocumentRepository';
import type { AgentDocumentDto } from '../../dto/AgentDto';

export class ListAgentDocumentsQueryHandler implements IQueryHandler<ListAgentDocumentsQuery, AgentDocumentDto[]> {
  constructor(private readonly documentRepository: IDocumentRepository) {}

  async handle(query: ListAgentDocumentsQuery): Promise<AgentDocumentDto[]> {
    const tenantId = query.tenantId ?? 'default';
    const documents = await this.documentRepository.findByAgentId(query.agentId, tenantId);

    return documents.map(doc => ({
      id: doc.id,
      agentId: doc.agentId,
      tenantId: doc.tenantId,
      filename: doc.filename,
      contentType: doc.contentType,
      status: doc.status,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));
  }
}
