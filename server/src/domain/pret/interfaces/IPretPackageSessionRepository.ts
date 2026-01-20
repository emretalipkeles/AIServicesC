import type { PretPackageSession } from '../entities/PretPackageSession';

export interface IPretPackageSessionRepository {
  save(session: PretPackageSession): Promise<void>;
  
  findById(id: string, tenantId: string): Promise<PretPackageSession | null>;
  
  findByPackageId(packageId: string, tenantId: string): Promise<PretPackageSession | null>;
  
  findAllByTenant(tenantId: string): Promise<PretPackageSession[]>;
  
  delete(id: string, tenantId: string): Promise<void>;
  
  update(session: PretPackageSession): Promise<void>;
}
