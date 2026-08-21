export class ProcessPodDocumentCommand {
  // Static `type` required by the command bus's resolution-by-property pattern: minified
  // production builds mangle constructor.name, so handlers are matched on this instead.
  static readonly type = 'ProcessPodDocumentCommand';

  constructor(
    public readonly documentId: string,
    public readonly projectId: string,
    public readonly tenantId: string,
    public readonly rawContent: string,
    public readonly filename: string,
    public readonly fallbackReportDate: Date | null
  ) {}
}
