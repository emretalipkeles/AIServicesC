import type { PretSessionMemory } from '../value-objects/PretSessionMemory';

export interface ISessionMemoryRepository {
  save(conversationId: string, tenantId: string, memory: PretSessionMemory): Promise<void>;
  
  get(conversationId: string, tenantId: string): Promise<PretSessionMemory | null>;
  
  delete(conversationId: string, tenantId: string): Promise<void>;
  
  updateActiveModel(conversationId: string, tenantId: string, modelName: string): Promise<void>;
  
  addLoadedFile(conversationId: string, tenantId: string, filePath: string): Promise<void>;
  
  addKeyPoint(conversationId: string, tenantId: string, keyPoint: string): Promise<void>;
}
