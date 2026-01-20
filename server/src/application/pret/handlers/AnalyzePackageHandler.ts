import type { AnalyzePackageCommand } from '../commands/AnalyzePackageCommand';
import type { IPackageAnalyzer } from '../../../domain/pret/interfaces/IPackageAnalyzer';
import type { IPretPackageStorage } from '../../../domain/pret/interfaces/IPretPackageStorage';
import type { PackageAnalysisDto } from '../dto/PackageAnalysisDto';
import type { PackageStructure } from '../../../domain/pret/value-objects/PackageStructure';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class AnalyzePackageHandler {
  constructor(
    private readonly storage: IPretPackageStorage,
    private readonly analyzer: IPackageAnalyzer
  ) {}

  async handle(command: AnalyzePackageCommand): Promise<PackageAnalysisDto> {
    const tempFilePath = await this.storage.downloadPackageZipToFile(
      command.tenantId,
      command.packageId
    );

    try {
      const structure = await this.analyzer.analyzeFromFile(tempFilePath);
      return this.structureToDto(command.packageId, structure);
    } finally {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Analyzes the package from extracted S3 files (rebuilt ZIP).
   * Use this when you need to analyze the current state of the package
   * including any modifications made after the original upload.
   */
  async handleFromExtractedFiles(tenantId: string, packageId: string): Promise<PackageAnalysisDto> {
    // Rebuild the ZIP from extracted files in S3
    const rebuiltZipBuffer = await this.storage.rebuildPackageAsZip(tenantId, packageId);
    
    // Write to temp file for analyzer
    const tempFilePath = path.join(os.tmpdir(), `pret-rebuilt-${packageId}-${Date.now()}.zip`);
    await fs.writeFile(tempFilePath, rebuiltZipBuffer);

    try {
      const structure = await this.analyzer.analyzeFromFile(tempFilePath);
      return this.structureToDto(packageId, structure);
    } finally {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private structureToDto(packageId: string, structure: PackageStructure): PackageAnalysisDto {
    return {
      packageId,
      packageName: structure.metadata.name,
      models: structure.models.map(m => ({
        name: m.name,
        type: m.type,
        path: m.path,
        dimensions: m.dimensions.map(d => ({
          kind: d.kind,
          name: d.name,
          path: d.path,
          accountCount: d.accountCount,
          hasCalculations: d.hasCalculations,
        })),
      })),
      dimensions: structure.dimensions.map(d => ({
        name: d.name,
        modelName: d.modelName,
        path: d.path,
        accountCount: d.accountCount,
        hasCalculations: d.hasCalculations,
      })),
      templates: structure.templates.map(t => ({
        name: t.name,
        modelName: t.modelName,
        path: t.path,
      })),
      namedSets: structure.namedSets.map(n => ({
        name: n.name,
        type: n.type,
        path: n.path,
      })),
      fileCount: structure.fileCount,
      analyzedAt: structure.analyzedAt.toISOString(),
    };
  }
}
