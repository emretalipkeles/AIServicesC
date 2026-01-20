import type { ISessionMemoryRepository } from '../../domain/interfaces/ISessionMemoryRepository';
import { PretSessionMemory, type PretSessionMemoryData } from '../../domain/value-objects/PretSessionMemory';

export class InMemorySessionMemoryRepository implements ISessionMemoryRepository {
  private storage: Map<string, PretSessionMemoryData> = new Map();

  private makeKey(conversationId: string, tenantId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  async save(conversationId: string, tenantId: string, memory: PretSessionMemory): Promise<void> {
    const key = this.makeKey(conversationId, tenantId);
    this.storage.set(key, memory.toJSON());
  }

  async get(conversationId: string, tenantId: string): Promise<PretSessionMemory | null> {
    const key = this.makeKey(conversationId, tenantId);
    const data = this.storage.get(key);
    if (!data) return null;
    return PretSessionMemory.fromJSON(data);
  }

  async delete(conversationId: string, tenantId: string): Promise<void> {
    const key = this.makeKey(conversationId, tenantId);
    this.storage.delete(key);
  }

  async updateActiveModel(conversationId: string, tenantId: string, modelName: string): Promise<void> {
    const existing = await this.get(conversationId, tenantId);
    if (existing) {
      await this.save(conversationId, tenantId, existing.withActiveModel(modelName));
    }
  }

  async addLoadedFile(conversationId: string, tenantId: string, filePath: string): Promise<void> {
    const existing = await this.get(conversationId, tenantId);
    if (existing) {
      await this.save(conversationId, tenantId, existing.withLoadedFile(filePath));
    }
  }

  async addKeyPoint(conversationId: string, tenantId: string, keyPoint: string): Promise<void> {
    const existing = await this.get(conversationId, tenantId);
    if (existing) {
      await this.save(conversationId, tenantId, existing.withKeyPoint(keyPoint));
    }
  }
}
