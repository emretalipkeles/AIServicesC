import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { UpdateAgentCommand } from '../UpdateAgentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { AgentDto } from '../../dto/AgentDto';
import { Agent } from '../../../domain/entities/Agent';

export class UpdateAgentCommandHandler implements ICommandHandler<UpdateAgentCommand, AgentDto> {
  constructor(private readonly agentRepository: IAgentRepository) {}

  async handle(command: UpdateAgentCommand): Promise<AgentDto> {
    const tenantId = command.tenantId ?? 'default';
    const existing = await this.agentRepository.findById(command.id, tenantId);
    if (!existing) {
      throw new Error(`Agent not found: ${command.id}`);
    }

    const updated = new Agent({
      id: existing.id,
      tenantId: existing.tenantId,
      name: command.name ?? existing.name,
      description: command.description ?? existing.description,
      systemPrompt: command.systemPrompt ?? existing.systemPrompt,
      model: command.model ?? existing.model,
      allowedTables: command.allowedTables ?? existing.allowedTables,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    });

    await this.agentRepository.update(updated);

    return {
      id: updated.id,
      tenantId: updated.tenantId,
      name: updated.name,
      description: updated.description,
      systemPrompt: updated.systemPrompt,
      model: updated.model,
      allowedTables: updated.allowedTables,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
