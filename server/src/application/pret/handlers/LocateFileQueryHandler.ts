import type { IPretFileLocator, FileLocationResult } from '../../../domain/pret';
import type { LocateFileQuery, ILocateFileQueryHandler } from '../queries/LocateFileQuery';

export class LocateFileQueryHandler implements ILocateFileQueryHandler {
  constructor(private readonly fileLocator: IPretFileLocator) {}

  async handle(query: LocateFileQuery): Promise<FileLocationResult> {
    return this.fileLocator.locate(query.userIntent, query.packageAnalysis);
  }
}
