import type { ProjectDocument } from '../entities/ProjectDocument';

export interface DocumentContentSummary {
  documentId: string;
  filename: string;
  documentType: string;
  reportDate: Date | null;
  contentExcerpt: string;
  fullContent: string;
}

export interface IDocumentContentProvider {
  getDocumentsByIds(
    documentIds: string[],
    tenantId: string
  ): Promise<Map<string, DocumentContentSummary>>;

  getDocumentById(
    documentId: string,
    tenantId: string
  ): Promise<DocumentContentSummary | null>;
}
