import type { BuildContext } from '../entities/BuildContext';

export interface IBuildContextRepository {
  findByConversation(tenantId: string, conversationId: string): Promise<BuildContext | null>;
  
  save(context: BuildContext): Promise<void>;
  
  delete(tenantId: string, conversationId: string): Promise<void>;
}
