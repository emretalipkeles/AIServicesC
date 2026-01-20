export class ListProjectDocumentsQuery {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string
  ) {}
}
