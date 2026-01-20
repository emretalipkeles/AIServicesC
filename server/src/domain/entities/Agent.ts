export interface AgentProps {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  systemPrompt: string;
  model: string;
  agentType?: string;
  allowedTables?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Agent {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string | null;
  readonly systemPrompt: string;
  readonly model: string;
  readonly agentType: string;
  readonly allowedTables: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AgentProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.description = props.description ?? null;
    this.systemPrompt = props.systemPrompt;
    this.model = props.model;
    this.agentType = props.agentType ?? 'standard';
    this.allowedTables = props.allowedTables ?? [];
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.validate();
  }

  private validate(): void {
    if (!this.name || this.name.trim().length < 2) {
      throw new Error('Agent name must be at least 2 characters');
    }
    if (!this.systemPrompt || this.systemPrompt.trim().length < 10) {
      throw new Error('System prompt must be at least 10 characters');
    }
  }

  withUpdatedPrompt(systemPrompt: string): Agent {
    return new Agent({
      ...this,
      systemPrompt,
      updatedAt: new Date(),
    });
  }

  withUpdatedModel(model: string): Agent {
    return new Agent({
      ...this,
      model,
      updatedAt: new Date(),
    });
  }

  withUpdatedAllowedTables(allowedTables: string[]): Agent {
    return new Agent({
      ...this,
      allowedTables,
      updatedAt: new Date(),
    });
  }

  canWriteToTable(tableName: string): boolean {
    return this.allowedTables.includes(tableName);
  }
}
