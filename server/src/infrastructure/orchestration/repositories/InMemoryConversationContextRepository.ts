import type { IConversationContextRepository } from '../../../domain/orchestration/interfaces/IConversationContextRepository';
import { ConversationContext } from '../../../domain/orchestration/value-objects/ConversationContext';

export class InMemoryConversationContextRepository implements IConversationContextRepository {
  private contexts: Map<string, ConversationContext> = new Map();

  private getKey(conversationId: string, tenantId: string): string {
    return `${tenantId}:${conversationId}`;
  }

  async findByConversationId(conversationId: string, tenantId: string): Promise<ConversationContext | null> {
    const key = this.getKey(conversationId, tenantId);
    return this.contexts.get(key) || null;
  }

  async save(context: ConversationContext): Promise<void> {
    const key = this.getKey(context.conversationId, context.tenantId);
    this.contexts.set(key, context);
  }

  async update(context: ConversationContext): Promise<void> {
    const key = this.getKey(context.conversationId, context.tenantId);
    this.contexts.set(key, context);
  }
}
