import type { PackageAnalysisData, FileLocationResult } from '../../../domain/pret';

export class LocateFileQuery {
  constructor(
    public readonly userIntent: string,
    public readonly packageAnalysis: PackageAnalysisData
  ) {}
}

export interface ILocateFileQueryHandler {
  handle(query: LocateFileQuery): Promise<FileLocationResult>;
}
