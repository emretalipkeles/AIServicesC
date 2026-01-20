import type { ConversationContext } from '../value-objects/ConversationContext';

export interface IConversationContextRepository {
  findByConversationId(conversationId: string, tenantId: string): Promise<ConversationContext | null>;
  save(context: ConversationContext): Promise<void>;
  update(context: ConversationContext): Promise<void>;
}
