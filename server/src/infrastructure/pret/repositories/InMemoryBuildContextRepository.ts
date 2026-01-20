import type { IBuildContextRepository } from '../../../domain/pret/interfaces/IBuildContextRepository';
import { BuildContext } from '../../../domain/pret/entities/BuildContext';

export class InMemoryBuildContextRepository implements IBuildContextRepository {
  private readonly contexts: Map<string, BuildContext> = new Map();

  private makeKey(tenantId: string, conversationId: string): string {
    return `${tenantId}::${conversationId}`;
  }

  async findByConversation(tenantId: string, conversationId: string): Promise<BuildContext | null> {
    const key = this.makeKey(tenantId, conversationId);
    return this.contexts.get(key) || null;
  }

  async save(context: BuildContext): Promise<void> {
    const key = this.makeKey(context.tenantId, context.conversationId);
    this.contexts.set(key, context);
  }

  async delete(tenantId: string, conversationId: string): Promise<void> {
    const key = this.makeKey(tenantId, conversationId);
    this.contexts.delete(key);
  }

  clear(): void {
    this.contexts.clear();
  }
}
