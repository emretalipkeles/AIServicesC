import { BaseCommand } from '../interfaces/ICommandBus';

export class CreateAgentCommand extends BaseCommand {
  readonly type = 'CreateAgentCommand' as const;
  constructor(
    tenantId: string,
    public readonly name: string,
    public readonly systemPrompt: string,
    public readonly model: string = 'claude-sonnet-4-5',
    public readonly description?: string,
    public readonly allowedTables?: string[]
  ) {
    super(tenantId);
  }
}
