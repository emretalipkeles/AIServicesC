import { BaseCommand } from '../interfaces/ICommandBus';

export class ReindexAgentCommand extends BaseCommand {
  constructor(
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
