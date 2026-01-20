import type { FileReadResult, FileReadOptions } from '../../../domain/pret';

export class ReadFileQuery {
  constructor(
    public readonly tenantId: string,
    public readonly packageId: string,
    public readonly filePath: string,
    public readonly options?: FileReadOptions
  ) {}
}

export interface IReadFileQueryHandler {
  handle(query: ReadFileQuery): Promise<FileReadResult>;
}
