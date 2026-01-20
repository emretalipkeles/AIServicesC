import type { PackageStructure } from '../value-objects/PackageStructure';

export interface IPackageAnalyzer {
  analyzeFromFile(zipFilePath: string): Promise<PackageStructure>;
  
  getFileListFromFile(zipFilePath: string): Promise<string[]>;
  
  extractFileFromZip(zipFilePath: string, targetPath: string): Promise<Buffer>;
}
