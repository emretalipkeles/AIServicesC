export class GetDelayEventsByDocumentQuery {
  constructor(
    public readonly documentId: string,
    public readonly projectId: string,
    public readonly tenantId: string
  ) {}
}
