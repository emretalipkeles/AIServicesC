export class UpdateConversationContextCommand {
  constructor(
    public readonly conversationId: string,
    public readonly tenantId: string,
    public readonly packageId: string,
    public readonly packageName: string,
    public readonly s3Path: string
  ) {}
}
