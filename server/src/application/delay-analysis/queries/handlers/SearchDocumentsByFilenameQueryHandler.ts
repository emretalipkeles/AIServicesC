import type { SearchDocumentsByFilenameQuery } from '../SearchDocumentsByFilenameQuery';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { ProjectDocumentType, DocumentProcessingStatus } from '../../../../domain/delay-analysis/entities/ProjectDocument';

export interface SearchDocumentsByFilenameDto {
  id: string;
  filename: string;
  documentType: ProjectDocumentType;
  reportDate: Date | null;
  status: DocumentProcessingStatus;
}

export class SearchDocumentsByFilenameQueryHandler {
  constructor(
    private readonly documentRepository: IProjectDocumentRepository
  ) {}

  async execute(query: SearchDocumentsByFilenameQuery): Promise<SearchDocumentsByFilenameDto[]> {
    console.log(`[SearchDocumentsByFilenameQueryHandler] Searching for pattern "${query.filenamePattern}" in project ${query.projectId}`);

    const documents = await this.documentRepository.findByFilenamePattern(
      query.projectId,
      query.tenantId,
      query.filenamePattern
    );

    console.log(`[SearchDocumentsByFilenameQueryHandler] Found ${documents.length} documents matching "${query.filenamePattern}"${documents.length > 0 ? ': ' + documents.map(d => d.filename).join(', ') : ''}`);

    return documents.map(doc => ({
      id: doc.id,
      filename: doc.filename,
      documentType: doc.documentType,
      reportDate: doc.reportDate,
      status: doc.status,
    }));
  }
}
