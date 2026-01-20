import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import yauzl from 'yauzl';
import type { 
  IPretPackageStorage, 
  UploadResult, 
  PackageValidationResult 
} from '../../../domain/pret/interfaces/IPretPackageStorage';

export class S3PretPackageStorage implements IPretPackageStorage {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(bucketName: string) {
    const region = process.env.S3_REGION || process.env.AWS_BEDROCK_REGION || 'us-east-1';
    const accessKeyId = process.env.S3_AUTH_KEY;
    const secretAccessKey = process.env.S3_AUTH_SECRET;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3 credentials not configured: S3_AUTH_KEY and S3_AUTH_SECRET are required');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.bucketName = bucketName;
  }

  private getBasePath(tenantId: string, packageId: string): string {
    return `pret-packages/${tenantId}/${packageId}`;
  }

  async uploadPackage(
    tenantId: string,
    packageId: string,
    fileBuffer: Buffer,
    originalFilename: string
  ): Promise<UploadResult> {
    const basePath = this.getBasePath(tenantId, packageId);
    const s3Path = `${basePath}/package.zip`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Path,
      Body: fileBuffer,
      ContentType: 'application/zip',
      Metadata: {
        'original-filename': originalFilename,
        'tenant-id': tenantId,
        'package-id': packageId,
      },
    }));

    // Extract all YAML files to S3 for direct access
    await this.extractPackageContents(tenantId, packageId, fileBuffer);

    return { s3Path, packageId };
  }

  async extractPackageContents(
    tenantId: string,
    packageId: string,
    fileBuffer: Buffer
  ): Promise<string[]> {
    const extractedFiles: string[] = [];
    const basePath = this.getBasePath(tenantId, packageId);

    try {
      const zip = new AdmZip(fileBuffer);
      const entries = zip.getEntries();

      for (const entry of entries) {
        const fileName = entry.entryName;
        const s3Key = `${basePath}/extracted/${fileName}`;

        if (entry.isDirectory) {
          await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key.endsWith('/') ? s3Key : `${s3Key}/`,
            Body: Buffer.alloc(0),
            ContentType: 'application/x-directory',
          }));
          console.log(`[S3PretPackageStorage] Stored directory marker: ${fileName}`);
          continue;
        }

        if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
          const content = entry.getData();

          await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: s3Key,
            Body: content,
            ContentType: 'text/yaml',
          }));

          extractedFiles.push(fileName);
          console.log(`[S3PretPackageStorage] Extracted: ${fileName}`);
        }
      }

      console.log(`[S3PretPackageStorage] Extracted ${extractedFiles.length} YAML files for package ${packageId}`);
    } catch (error) {
      console.error('[S3PretPackageStorage] Error extracting package contents:', error);
      throw error;
    }

    return extractedFiles;
  }

  async downloadPackageZipToFile(tenantId: string, packageId: string): Promise<string> {
    const basePath = this.getBasePath(tenantId, packageId);
    const s3ZipPath = `${basePath}/package.zip`;

    const response = await this.s3Client.send(new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3ZipPath,
    }));

    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `pret_${packageId}_${Date.now()}.zip`);

    const stream = response.Body as NodeJS.ReadableStream;
    const fileStream = fs.createWriteStream(tempFilePath);
    
    await pipeline(stream, fileStream);

    return tempFilePath;
  }

  async validatePackageStructure(fileBuffer: Buffer): Promise<PackageValidationResult> {
    const errors: string[] = [];
    let packageName: string | undefined;

    try {
      const zip = new AdmZip(fileBuffer);
      const entries = zip.getEntries();
      const entryNames = entries.map(e => e.entryName);

      const hasPackageYaml = entryNames.some(name => 
        name === 'package.yaml' || name.endsWith('/package.yaml')
      );

      if (!hasPackageYaml) {
        errors.push('Missing required package.yaml file at root level');
      } else {
        const packageYamlEntry = entries.find(e => 
          e.entryName === 'package.yaml' || e.entryName.endsWith('/package.yaml')
        );
        if (packageYamlEntry) {
          const content = packageYamlEntry.getData().toString('utf-8');
          const nameMatch = content.match(/name:\s*['"]?([^'"\n]+)['"]?/);
          if (nameMatch) {
            packageName = nameMatch[1].trim();
          }
        }
      }

      const hasTemplatesFolder = entryNames.some(name => 
        name.startsWith('templates/') || name.includes('/templates/')
      );

      if (!hasTemplatesFolder) {
        errors.push('Missing required templates/ folder');
      }

    } catch (error) {
      errors.push(`Invalid ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      packageName,
      errors,
    };
  }

  async getPackageContents(tenantId: string, packageId: string): Promise<string[]> {
    const basePath = this.getBasePath(tenantId, packageId);
    const extractedPath = `${basePath}/extracted`;

    const response = await this.s3Client.send(new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: extractedPath,
    }));

    if (!response.Contents) {
      return [];
    }

    return response.Contents
      .map((obj: { Key?: string }) => obj.Key!)
      .filter((key: string) => key !== extractedPath)
      .map((key: string) => key.replace(`${extractedPath}/`, ''));
  }

  async deletePackage(tenantId: string, packageId: string): Promise<void> {
    const basePath = this.getBasePath(tenantId, packageId);

    const listResponse = await this.s3Client.send(new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: basePath,
    }));

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return;
    }

    const objectsToDelete = listResponse.Contents.map((obj: { Key?: string }) => ({ Key: obj.Key! }));

    await this.s3Client.send(new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: { Objects: objectsToDelete },
    }));
  }

  async getFileContent(
    tenantId: string,
    packageId: string,
    filePath: string
  ): Promise<Buffer> {
    // First try to read from extracted files (faster)
    const basePath = this.getBasePath(tenantId, packageId);
    const extractedPath = `${basePath}/extracted/${filePath}`;

    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: extractedPath,
      }));

      const stream = response.Body as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      console.log(`[S3PretPackageStorage] Read extracted file: ${filePath}`);
      return Buffer.concat(chunks);
    } catch (error) {
      // Fall back to extracting from ZIP if extracted file not found
      console.log(`[S3PretPackageStorage] Extracted file not found, falling back to ZIP: ${filePath}`);
    }

    // Fallback: extract from ZIP
    const tempFilePath = await this.downloadPackageZipToFile(tenantId, packageId);
    
    try {
      return await this.extractFileFromZip(tempFilePath, filePath);
    } finally {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private extractFileFromZip(zipFilePath: string, targetPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipFilePath, { lazyEntries: true }, (err, zipFile) => {
        if (err || !zipFile) {
          reject(err || new Error('Failed to open ZIP'));
          return;
        }

        let found = false;

        zipFile.on('entry', (entry: yauzl.Entry) => {
          if (entry.fileName === targetPath) {
            found = true;
            zipFile.openReadStream(entry, (streamErr, readStream) => {
              if (streamErr || !readStream) {
                reject(streamErr || new Error('Failed to open stream'));
                return;
              }

              const chunks: Buffer[] = [];
              readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
              readStream.on('end', () => {
                resolve(Buffer.concat(chunks));
                zipFile.close();
              });
              readStream.on('error', reject);
            });
          } else {
            zipFile.readEntry();
          }
        });

        zipFile.on('end', () => {
          if (!found) {
            reject(new Error(`File not found in package: ${targetPath}`));
          }
        });

        zipFile.on('error', reject);
        zipFile.readEntry();
      });
    });
  }

  async saveFileContent(
    tenantId: string,
    packageId: string,
    filePath: string,
    content: Buffer
  ): Promise<void> {
    const basePath = this.getBasePath(tenantId, packageId);
    const fullPath = `${basePath}/extracted/${filePath}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fullPath,
      Body: content,
    }));
  }

  async rebuildPackageAsZip(
    tenantId: string,
    packageId: string
  ): Promise<Buffer> {
    const basePath = this.getBasePath(tenantId, packageId);
    const extractedPrefix = `${basePath}/extracted/`;

    const allObjects: { Key: string }[] = [];
    let continuationToken: string | undefined;
    let isTruncated = true;

    while (isTruncated) {
      const listResponse = await this.s3Client.send(new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: extractedPrefix,
        ContinuationToken: continuationToken,
      }));

      if (listResponse.Contents) {
        for (const obj of listResponse.Contents) {
          if (obj.Key) {
            allObjects.push({ Key: obj.Key });
          }
        }
      }

      isTruncated = listResponse.IsTruncated ?? false;
      
      if (isTruncated) {
        if (!listResponse.NextContinuationToken) {
          console.error(`[S3PretPackageStorage] S3 returned IsTruncated=true but no NextContinuationToken for package ${packageId}`);
          throw new Error(`Incomplete file listing for package ${packageId}: pagination error`);
        }
        continuationToken = listResponse.NextContinuationToken;
      }
    }

    if (allObjects.length === 0) {
      throw new Error(`No files found for package ${packageId}`);
    }

    // Detect common root folder to strip (e.g., "CIC_New1-1.0.0 (1)/")
    const relativePaths = allObjects.map(obj => obj.Key.replace(extractedPrefix, '')).filter(p => p);
    let commonPrefix = '';
    
    if (relativePaths.length > 0) {
      const firstPath = relativePaths[0];
      const firstSlashIndex = firstPath.indexOf('/');
      if (firstSlashIndex > 0) {
        const potentialPrefix = firstPath.substring(0, firstSlashIndex + 1);
        const allHaveSamePrefix = relativePaths.every(p => p.startsWith(potentialPrefix));
        if (allHaveSamePrefix) {
          commonPrefix = potentialPrefix;
          console.log(`[S3PretPackageStorage] Stripping common root folder: ${commonPrefix}`);
        }
      }
    }

    const zip = new AdmZip();

    const addedDirs = new Set<string>();

    for (const obj of allObjects) {
      let relativePath = obj.Key.replace(extractedPrefix, '');
      if (!relativePath) continue;

      // Strip the common root folder if detected
      if (commonPrefix && relativePath.startsWith(commonPrefix)) {
        relativePath = relativePath.substring(commonPrefix.length);
      }
      
      if (!relativePath) continue;

      // Handle directory markers (end with /)
      if (relativePath.endsWith('/')) {
        if (!addedDirs.has(relativePath)) {
          zip.addFile(relativePath, Buffer.alloc(0));
          addedDirs.add(relativePath);
          console.log(`[S3PretPackageStorage] Added directory entry: ${relativePath}`);
        }
        continue;
      }

      try {
        const getResponse = await this.s3Client.send(new GetObjectCommand({
          Bucket: this.bucketName,
          Key: obj.Key,
        }));

        const stream = getResponse.Body as NodeJS.ReadableStream;
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        const fileContent = Buffer.concat(chunks);

        zip.addFile(relativePath, fileContent);
      } catch (error) {
        console.error(`[S3PretPackageStorage] Failed to read file ${obj.Key}:`, error);
      }
    }

    console.log(`[S3PretPackageStorage] Rebuilt ZIP with ${allObjects.length} entries (${addedDirs.size} directories) for package ${packageId}`);
    return zip.toBuffer();
  }
}
