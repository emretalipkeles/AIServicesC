import { BaseCommand } from '../interfaces/ICommandBus';

export class UpdateAgentCommand extends BaseCommand {
  readonly type = 'UpdateAgentCommand' as const;
  constructor(
    public readonly id: string,
    tenantId: string,
    public readonly name?: string,
    public readonly systemPrompt?: string,
    public readonly model?: string,
    public readonly description?: string,
    public readonly allowedTables?: string[]
  ) {
    super(tenantId);
  }
}
