import { randomUUID } from 'node:crypto';

export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly tenantId?: string;
}

export abstract class BaseDomainEvent implements DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventType: string;

  constructor(
    public readonly aggregateId: string,
    public readonly tenantId?: string
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.eventType = this.constructor.name;
  }
}
