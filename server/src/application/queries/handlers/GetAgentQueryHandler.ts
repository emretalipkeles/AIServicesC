import type { IQueryHandler } from '../../interfaces/IQueryBus';
import type { GetAgentQuery } from '../GetAgentQuery';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { AgentDto } from '../../dto/AgentDto';

export class GetAgentQueryHandler implements IQueryHandler<GetAgentQuery, AgentDto | null> {
  constructor(private readonly agentRepository: IAgentRepository) {}

  async handle(query: GetAgentQuery): Promise<AgentDto | null> {
    const tenantId = query.tenantId ?? 'default';
    const agent = await this.agentRepository.findById(query.id, tenantId);
    if (!agent) return null;

    return {
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      allowedTables: agent.allowedTables,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }
}
