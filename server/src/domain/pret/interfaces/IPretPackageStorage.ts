export interface UploadResult {
  readonly s3Path: string;
  readonly packageId: string;
}

export interface PackageValidationResult {
  readonly isValid: boolean;
  readonly packageName?: string;
  readonly errors: string[];
}

export interface IPretPackageStorage {
  uploadPackage(
    tenantId: string,
    packageId: string,
    fileBuffer: Buffer,
    originalFilename: string
  ): Promise<UploadResult>;

  downloadPackageZipToFile(
    tenantId: string,
    packageId: string
  ): Promise<string>;

  validatePackageStructure(
    fileBuffer: Buffer
  ): Promise<PackageValidationResult>;

  getPackageContents(
    tenantId: string,
    packageId: string
  ): Promise<string[]>;

  deletePackage(
    tenantId: string,
    packageId: string
  ): Promise<void>;

  getFileContent(
    tenantId: string,
    packageId: string,
    filePath: string
  ): Promise<Buffer>;

  saveFileContent(
    tenantId: string,
    packageId: string,
    filePath: string,
    content: Buffer
  ): Promise<void>;

  rebuildPackageAsZip(
    tenantId: string,
    packageId: string
  ): Promise<Buffer>;
}
