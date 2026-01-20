import { BaseDomainEvent } from './DomainEvent';

export class ChatCompletedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    public readonly model: string,
    public readonly inputTokens: number,
    public readonly outputTokens: number,
    public readonly latencyMs: number,
    tenantId?: string
  ) {
    super(aggregateId, tenantId);
  }
}

export class ConnectionTestedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    public readonly authMethod: 'api-key' | 'iam',
    public readonly success: boolean,
    public readonly latencyMs: number,
    public readonly error?: string,
    tenantId?: string
  ) {
    super(aggregateId, tenantId);
  }
}

export class AIErrorEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    public readonly errorType: string,
    public readonly errorMessage: string,
    public readonly model?: string,
    tenantId?: string
  ) {
    super(aggregateId, tenantId);
  }
}
