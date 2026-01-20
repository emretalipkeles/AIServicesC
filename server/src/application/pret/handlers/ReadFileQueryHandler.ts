import type { IPretFileReader, FileReadResult } from '../../../domain/pret';
import type { ReadFileQuery, IReadFileQueryHandler } from '../queries/ReadFileQuery';

export class ReadFileQueryHandler implements IReadFileQueryHandler {
  constructor(private readonly fileReader: IPretFileReader) {}

  async handle(query: ReadFileQuery): Promise<FileReadResult> {
    return this.fileReader.readFile(
      query.tenantId,
      query.packageId,
      query.filePath,
      query.options
    );
  }
}
