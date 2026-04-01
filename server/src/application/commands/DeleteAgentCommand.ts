import { BaseCommand } from '../interfaces/ICommandBus';

export class DeleteAgentCommand extends BaseCommand {
  readonly type = 'DeleteAgentCommand' as const;
  constructor(
    public readonly id: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
