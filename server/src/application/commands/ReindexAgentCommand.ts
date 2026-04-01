import { BaseCommand } from '../interfaces/ICommandBus';

export class ReindexAgentCommand extends BaseCommand {
  readonly type = 'ReindexAgentCommand' as const;
  constructor(
    public readonly agentId: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
