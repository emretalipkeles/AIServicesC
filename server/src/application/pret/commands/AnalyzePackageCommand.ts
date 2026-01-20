export class AnalyzePackageCommand {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string
  ) {}

  static create(tenantId: string, packageId: string): AnalyzePackageCommand {
    return new AnalyzePackageCommand(tenantId, packageId);
  }
}
