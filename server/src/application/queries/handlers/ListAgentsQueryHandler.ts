import type { IQueryHandler } from '../../interfaces/IQueryBus';
import type { ListAgentsQuery } from '../ListAgentsQuery';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { AgentDto } from '../../dto/AgentDto';

export class ListAgentsQueryHandler implements IQueryHandler<ListAgentsQuery, AgentDto[]> {
  constructor(private readonly agentRepository: IAgentRepository) {}

  async handle(query: ListAgentsQuery): Promise<AgentDto[]> {
    const tenantId = query.tenantId ?? 'default';
    const agents = await this.agentRepository.findAll(tenantId);

    return agents.map(agent => ({
      id: agent.id,
      tenantId: agent.tenantId,
      name: agent.name,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      model: agent.model,
      allowedTables: agent.allowedTables,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    }));
  }
}
