import type { IPackageAnalysisCache, PackageAnalysisData } from '../../../domain/pret';

export class InMemoryPackageAnalysisCache implements IPackageAnalysisCache {
  private cache: Map<string, PackageAnalysisData> = new Map();
  private dtoCache: Map<string, unknown> = new Map();

  get(packageId: string): PackageAnalysisData | undefined {
    return this.cache.get(packageId);
  }

  set(packageId: string, analysis: PackageAnalysisData): void {
    this.cache.set(packageId, analysis);
  }

  has(packageId: string): boolean {
    return this.cache.has(packageId);
  }

  delete(packageId: string): boolean {
    this.dtoCache.delete(packageId);
    return this.cache.delete(packageId);
  }

  getDto<T>(packageId: string): T | undefined {
    return this.dtoCache.get(packageId) as T | undefined;
  }

  setDto<T>(packageId: string, dto: T): void {
    this.dtoCache.set(packageId, dto);
  }
}
