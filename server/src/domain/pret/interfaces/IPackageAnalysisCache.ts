import type { PackageAnalysisData } from './IPretFileLocator';

export interface IPackageAnalysisCache {
  get(packageId: string): PackageAnalysisData | undefined;
  set(packageId: string, analysis: PackageAnalysisData): void;
  has(packageId: string): boolean;
  delete(packageId: string): boolean;
  
  // Full DTO methods for analyze endpoint caching
  getDto<T>(packageId: string): T | undefined;
  setDto<T>(packageId: string, dto: T): void;
}
