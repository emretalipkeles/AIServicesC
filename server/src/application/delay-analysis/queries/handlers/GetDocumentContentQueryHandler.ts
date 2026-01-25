import type { GetDocumentContentQuery } from '../GetDocumentContentQuery';
import type { IDocumentContentProvider, DocumentContentSummary } from '../../../../domain/delay-analysis/interfaces/IDocumentContentProvider';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';

export interface GetDocumentContentResult {
  found: boolean;
  document?: DocumentContentSummary;
  error?: string;
}

export class GetDocumentContentQueryHandler {
  constructor(
    private readonly documentContentProvider: IDocumentContentProvider,
    private readonly documentRepository: IProjectDocumentRepository
  ) {}

  async handle(query: GetDocumentContentQuery): Promise<GetDocumentContentResult> {
    const document = await this.documentRepository.findById(
      query.documentId,
      query.tenantId
    );

    if (!document) {
      return {
        found: false,
        error: `Document ${query.documentId} not found`
      };
    }

    if (document.projectId !== query.projectId) {
      return {
        found: false,
        error: `Document does not belong to project ${query.projectId}`
      };
    }

    const content = await this.documentContentProvider.getDocumentById(
      query.documentId,
      query.tenantId
    );

    if (!content) {
      return {
        found: false,
        error: `Content not available for document ${query.documentId}`
      };
    }

    return {
      found: true,
      document: content
    };
  }
}
