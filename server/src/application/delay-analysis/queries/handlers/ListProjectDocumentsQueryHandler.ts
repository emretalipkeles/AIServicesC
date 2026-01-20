import type { ListProjectDocumentsQuery } from '../ListProjectDocumentsQuery';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';

export interface ProjectDocumentDto {
  id: string;
  projectId: string;
  filename: string;
  contentType: string;
  documentType: string;
  status: string;
  reportDate: string | null;
  errorMessage: string | null;
  hasContent: boolean;
  createdAt: string;
  updatedAt: string;
}

export class ListProjectDocumentsQueryHandler {
  constructor(
    private readonly documentRepository: IProjectDocumentRepository
  ) {}

  async execute(query: ListProjectDocumentsQuery): Promise<ProjectDocumentDto[]> {
    const documents = await this.documentRepository.findByProjectId(
      query.projectId,
      query.tenantId
    );

    const filteredDocuments = documents.filter(doc => doc.documentType !== 'cpm_schedule');

    return filteredDocuments.map(doc => ({
      id: doc.id,
      projectId: doc.projectId,
      filename: doc.filename,
      contentType: doc.contentType,
      documentType: doc.documentType,
      status: doc.status,
      reportDate: doc.reportDate?.toISOString() ?? null,
      errorMessage: doc.errorMessage,
      hasContent: doc.rawContent !== null && doc.rawContent.length > 0,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));
  }
}
