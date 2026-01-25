import { eq, and, inArray } from 'drizzle-orm';
import type { 
  IDocumentContentProvider, 
  DocumentContentSummary 
} from '../../domain/delay-analysis/interfaces/IDocumentContentProvider';
import { projectDocuments } from '@shared/schema';
import { db } from '../database';

export class DocumentContentProvider implements IDocumentContentProvider {
  private readonly MAX_EXCERPT_LENGTH = 500;

  async getDocumentsByIds(
    documentIds: string[],
    tenantId: string
  ): Promise<Map<string, DocumentContentSummary>> {
    if (documentIds.length === 0) {
      return new Map();
    }

    const uniqueIds = Array.from(new Set(documentIds));

    const results = await db
      .select({
        id: projectDocuments.id,
        filename: projectDocuments.filename,
        documentType: projectDocuments.documentType,
        reportDate: projectDocuments.reportDate,
        rawContent: projectDocuments.rawContent,
      })
      .from(projectDocuments)
      .where(and(
        inArray(projectDocuments.id, uniqueIds),
        eq(projectDocuments.tenantId, tenantId)
      ));

    const documentMap = new Map<string, DocumentContentSummary>();

    for (const row of results) {
      const fullContent = row.rawContent ?? '';
      const contentExcerpt = this.createExcerpt(fullContent);

      documentMap.set(row.id, {
        documentId: row.id,
        filename: row.filename,
        documentType: row.documentType,
        reportDate: row.reportDate,
        contentExcerpt,
        fullContent,
      });
    }

    return documentMap;
  }

  async getDocumentById(
    documentId: string,
    tenantId: string
  ): Promise<DocumentContentSummary | null> {
    const result = await db
      .select({
        id: projectDocuments.id,
        filename: projectDocuments.filename,
        documentType: projectDocuments.documentType,
        reportDate: projectDocuments.reportDate,
        rawContent: projectDocuments.rawContent,
      })
      .from(projectDocuments)
      .where(and(
        eq(projectDocuments.id, documentId),
        eq(projectDocuments.tenantId, tenantId)
      ))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    const fullContent = row.rawContent ?? '';
    const contentExcerpt = this.createExcerpt(fullContent);

    return {
      documentId: row.id,
      filename: row.filename,
      documentType: row.documentType,
      reportDate: row.reportDate,
      contentExcerpt,
      fullContent,
    };
  }

  private createExcerpt(content: string): string {
    if (!content || content.length <= this.MAX_EXCERPT_LENGTH) {
      return content;
    }
    return content.substring(0, this.MAX_EXCERPT_LENGTH) + '...';
  }
}
