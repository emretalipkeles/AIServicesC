export class ImportPretPackageCommand {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string,
    public readonly fileBuffer: Buffer,
    public readonly originalFilename: string
  ) {}

  static create(
    tenantId: string,
    packageId: string,
    fileBuffer: Buffer,
    originalFilename: string
  ): ImportPretPackageCommand {
    return new ImportPretPackageCommand(
      tenantId,
      packageId,
      fileBuffer,
      originalFilename
    );
  }
}
