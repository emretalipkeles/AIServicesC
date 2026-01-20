import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { CreateAgentCommand } from '../CreateAgentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { AgentDto } from '../../dto/AgentDto';
import { Agent } from '../../../domain/entities/Agent';
import { randomUUID } from 'crypto';

export class CreateAgentCommandHandler implements ICommandHandler<CreateAgentCommand, AgentDto> {
  constructor(private readonly agentRepository: IAgentRepository) {}

  async handle(command: CreateAgentCommand): Promise<AgentDto> {
    const tenantId = command.tenantId ?? 'default';
    const now = new Date();
    const agent = new Agent({
      id: randomUUID(),
      tenantId,
      name: command.name,
      description: command.description ?? null,
      systemPrompt: command.systemPrompt,
      model: command.model,
      allowedTables: command.allowedTables ?? [],
      createdAt: now,
      updatedAt: now,
    });

    await this.agentRepository.save(agent);

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
