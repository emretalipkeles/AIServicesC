export class SearchDocumentsByFilenameQuery {
  constructor(
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly filenamePattern: string
  ) {}
}
