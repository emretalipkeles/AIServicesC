export class StreamNarrateUploadResultCommand {
  constructor(
    public readonly tenantId: string,
    public readonly success: boolean,
    public readonly packageName: string,
    public readonly packageId: string,
    public readonly error?: string,
    public readonly validationErrors?: string[],
    public readonly conversationId?: string
  ) {}

  static create(
    tenantId: string,
    success: boolean,
    packageName: string,
    packageId: string,
    error?: string,
    validationErrors?: string[],
    conversationId?: string
  ): StreamNarrateUploadResultCommand {
    return new StreamNarrateUploadResultCommand(
      tenantId,
      success,
      packageName,
      packageId,
      error,
      validationErrors,
      conversationId
    );
  }
}
