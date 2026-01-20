import type { FileContext } from '../value-objects/FileContext';

export interface FileContextKey {
  readonly conversationId: string;
  readonly filePath: string;
}

export interface IFileContextRepository {
  save(context: FileContext): Promise<void>;

  findByKey(key: FileContextKey): Promise<FileContext | null>;

  findByConversation(conversationId: string): Promise<FileContext[]>;

  exists(key: FileContextKey): Promise<boolean>;

  delete(key: FileContextKey): Promise<void>;

  deleteByConversation(conversationId: string): Promise<void>;
}
