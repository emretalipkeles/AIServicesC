import { BaseCommand } from '../interfaces/ICommandBus';

export interface StructuredOutputBlock {
  tableName: string;
  data: Record<string, unknown>;
}

export class SaveStructuredOutputCommand extends BaseCommand {
  constructor(
    tenantId: string,
    public readonly agentId: string,
    public readonly blocks: StructuredOutputBlock[]
  ) {
    super(tenantId);
  }
}
