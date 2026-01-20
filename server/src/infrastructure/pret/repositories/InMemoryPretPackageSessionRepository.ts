import type { IPretPackageSessionRepository } from '../../../domain/pret/interfaces/IPretPackageSessionRepository';
import { PretPackageSession } from '../../../domain/pret/entities/PretPackageSession';

export class InMemoryPretPackageSessionRepository implements IPretPackageSessionRepository {
  private readonly sessions: Map<string, PretPackageSession> = new Map();

  async save(session: PretPackageSession): Promise<void> {
    const key = this.makeKey(session.id, session.tenantId);
    this.sessions.set(key, session);
  }

  async findById(id: string, tenantId: string): Promise<PretPackageSession | null> {
    const key = this.makeKey(id, tenantId);
    return this.sessions.get(key) || null;
  }

  async findByPackageId(packageId: string, tenantId: string): Promise<PretPackageSession | null> {
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.packageId === packageId && session.tenantId === tenantId) {
        return session;
      }
    }
    return null;
  }

  async findAllByTenant(tenantId: string): Promise<PretPackageSession[]> {
    const results: PretPackageSession[] = [];
    const sessions = Array.from(this.sessions.values());
    for (const session of sessions) {
      if (session.tenantId === tenantId) {
        results.push(session);
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const key = this.makeKey(id, tenantId);
    this.sessions.delete(key);
  }

  async update(session: PretPackageSession): Promise<void> {
    const key = this.makeKey(session.id, session.tenantId);
    if (!this.sessions.has(key)) {
      throw new Error(`Session ${session.id} not found for tenant ${session.tenantId}`);
    }
    this.sessions.set(key, session);
  }

  private makeKey(id: string, tenantId: string): string {
    return `${tenantId}::${id}`;
  }
}
