import type { IFileContextRepository, FileContextKey, FileContext } from '../../../domain/pret';

export class InMemoryFileContextRepository implements IFileContextRepository {
  private readonly contexts: Map<string, FileContext> = new Map();

  private makeKey(key: FileContextKey): string {
    return `${key.conversationId}::${key.filePath}`;
  }

  async save(context: FileContext): Promise<void> {
    const key = this.makeKey({
      conversationId: context.conversationId,
      filePath: context.filePath,
    });
    this.contexts.set(key, context);
  }

  async findByKey(key: FileContextKey): Promise<FileContext | null> {
    const mapKey = this.makeKey(key);
    return this.contexts.get(mapKey) || null;
  }

  async findByConversation(conversationId: string): Promise<FileContext[]> {
    const results: FileContext[] = [];
    const entries = Array.from(this.contexts.entries());
    for (const [key, context] of entries) {
      if (key.startsWith(`${conversationId}::`)) {
        results.push(context);
      }
    }
    return results;
  }

  async exists(key: FileContextKey): Promise<boolean> {
    const mapKey = this.makeKey(key);
    return this.contexts.has(mapKey);
  }

  async delete(key: FileContextKey): Promise<void> {
    const mapKey = this.makeKey(key);
    this.contexts.delete(mapKey);
  }

  async deleteByConversation(conversationId: string): Promise<void> {
    const keysToDelete: string[] = [];
    const keys = Array.from(this.contexts.keys());
    for (const key of keys) {
      if (key.startsWith(`${conversationId}::`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.contexts.delete(key);
    }
  }
}
