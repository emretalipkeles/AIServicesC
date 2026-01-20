import type { PretObjectTypeName } from '../value-objects/ObjectType';

export class ObjectGeneratedEvent {
  readonly occurredAt: Date;

  constructor(
    readonly tenantId: string,
    readonly conversationId: string,
    readonly objectType: PretObjectTypeName,
    readonly objectName: string,
    readonly isValid: boolean
  ) {
    this.occurredAt = new Date();
  }

  static create(
    tenantId: string,
    conversationId: string,
    objectType: PretObjectTypeName,
    objectName: string,
    isValid: boolean
  ): ObjectGeneratedEvent {
    return new ObjectGeneratedEvent(
      tenantId,
      conversationId,
      objectType,
      objectName,
      isValid
    );
  }
}
