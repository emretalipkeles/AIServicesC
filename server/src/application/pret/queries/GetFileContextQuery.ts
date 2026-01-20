import type { FileContext, FileContextKey } from '../../../domain/pret';

export class GetFileContextQuery {
  constructor(
    public readonly conversationId: string,
    public readonly filePath?: string
  ) {}
}

export interface IGetFileContextQueryHandler {
  handle(query: GetFileContextQuery): Promise<FileContext | FileContext[] | null>;
}
