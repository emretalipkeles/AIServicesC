import type { ProjectDocument } from '../entities/ProjectDocument';

/**
 * Extension seam for document-type-specific work that runs after a document's raw content
 * and report date have been committed (e.g. POD structured extraction). Mirrors the
 * IDocumentParser/IDocumentParserFactory seam so the upload handler resolves behaviour
 * through a factory instead of branching on document type inline.
 */
export interface IPostParseDocumentHandler {
  canHandle(documentType: string): boolean;
  handle(document: ProjectDocument): Promise<void>;
}
