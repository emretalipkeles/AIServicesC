import { BaseCommand } from '../interfaces/ICommandBus';

export class DeleteAgentCommand extends BaseCommand {
  constructor(
    public readonly id: string,
    tenantId: string
  ) {
    super(tenantId);
  }
}
