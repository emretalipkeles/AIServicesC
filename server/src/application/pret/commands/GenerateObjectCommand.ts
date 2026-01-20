import type { PretObjectTypeName } from '../../../domain/pret/value-objects/ObjectType';

export class GenerateObjectCommand {
  constructor(
    public readonly tenantId: string,
    public readonly conversationId: string,
    public readonly objectType: PretObjectTypeName,
    public readonly userMessage: string,
    public readonly previousContext?: string
  ) {}

  static create(
    tenantId: string,
    conversationId: string,
    objectType: PretObjectTypeName,
    userMessage: string,
    previousContext?: string
  ): GenerateObjectCommand {
    return new GenerateObjectCommand(
      tenantId,
      conversationId,
      objectType,
      userMessage,
      previousContext
    );
  }
}
