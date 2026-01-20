import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { DeleteAgentCommand } from '../DeleteAgentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';

export class DeleteAgentCommandHandler implements ICommandHandler<DeleteAgentCommand, void> {
  constructor(private readonly agentRepository: IAgentRepository) {}

  async handle(command: DeleteAgentCommand): Promise<void> {
    const tenantId = command.tenantId ?? 'default';
    const existing = await this.agentRepository.findById(command.id, tenantId);
    if (!existing) {
      throw new Error(`Agent not found: ${command.id}`);
    }

    await this.agentRepository.delete(command.id, tenantId);
  }
}
