import type { Request, Response } from 'express';
import { UploadDocumentsCommand, type UploadedFile } from '../../application/delay-analysis/commands/UploadDocumentsCommand';
import { UploadDocumentsCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadDocumentsCommandHandler';
import { DeleteAllProjectDocumentsCommand } from '../../application/delay-analysis/commands/DeleteAllProjectDocumentsCommand';
import { DeleteAllProjectDocumentsCommandHandler } from '../../application/delay-analysis/commands/handlers/DeleteAllProjectDocumentsCommandHandler';
import { ListProjectDocumentsQuery } from '../../application/delay-analysis/queries/ListProjectDocumentsQuery';
import { ListProjectDocumentsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListProjectDocumentsQueryHandler';
import type { ProjectDocumentType } from '../../domain/delay-analysis/entities/ProjectDocument';
import type { IProjectDocumentRepository } from '../../domain/delay-analysis/repositories/IProjectDocumentRepository';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MAX_HASHES_PER_CHECK = 1000;

export class ProjectDocumentController {
  constructor(
    private readonly uploadHandler: UploadDocumentsCommandHandler,
    private readonly listHandler: ListProjectDocumentsQueryHandler,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly deleteAllHandler?: DeleteAllProjectDocumentsCommandHandler
  ) {}

  async upload(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = (req as any).tenantId || 'default';
      const documentType = (req.body.documentType || 'other') as ProjectDocumentType;
      
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const uploadedFiles: UploadedFile[] = files.map(file => ({
        filename: file.originalname,
        contentType: file.mimetype,
        buffer: file.buffer,
        documentType,
      }));

      const command = new UploadDocumentsCommand(projectId, tenantId, uploadedFiles);
      const result = await this.uploadHandler.execute(command);

      res.status(201).json(result);
    } catch (error) {
      console.error('Error uploading documents:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to upload documents' 
      });
    }
  }

  /**
   * Lets the client find out which files it already uploaded BEFORE sending any bytes.
   * The client hashes each file locally (SHA-256, same algorithm the upload path uses)
   * and posts the hashes here; anything already stored is reported back so the client
   * can skip it. Without this, re-uploading a large folder re-transfers every duplicate.
   */
  async checkDuplicates(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = (req as any).tenantId || 'default';

      const rawHashes = (req.body as { hashes?: unknown }).hashes;
      if (!Array.isArray(rawHashes)) {
        res.status(400).json({ error: 'hashes must be an array of SHA-256 hex strings' });
        return;
      }
      if (rawHashes.length > MAX_HASHES_PER_CHECK) {
        res.status(400).json({ error: `At most ${MAX_HASHES_PER_CHECK} hashes may be checked per request` });
        return;
      }

      const hashes: string[] = [];
      for (const value of rawHashes) {
        if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
          res.status(400).json({ error: 'Each hash must be a 64-character hex SHA-256 string' });
          return;
        }
        hashes.push(value.toLowerCase());
      }

      const existing = await this.documentRepository.findExistingContentHashes(
        projectId,
        tenantId,
        Array.from(new Set(hashes))
      );

      res.json({ existing });
    } catch (error) {
      console.error('Error checking duplicate documents:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to check duplicates',
      });
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = (req as any).tenantId || 'default';

      const query = new ListProjectDocumentsQuery(projectId, tenantId);
      const documents = await this.listHandler.execute(query);

      res.json(documents);
    } catch (error) {
      console.error('Error listing documents:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to list documents' 
      });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { projectId, documentId } = req.params;
      const tenantId = (req as any).tenantId || 'default';

      const document = await this.documentRepository.findById(documentId, tenantId);
      
      if (!document || document.projectId !== projectId) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      res.json({
        id: document.id,
        projectId: document.projectId,
        filename: document.filename,
        contentType: document.contentType,
        documentType: document.documentType,
        status: document.status,
        reportDate: document.reportDate?.toISOString() ?? null,
        errorMessage: document.errorMessage,
        hasContent: document.rawContent !== null && document.rawContent.length > 0,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('Error fetching document:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to fetch document' 
      });
    }
  }

  async delete(req: Request, res: Response): Promise<void> {
    try {
      const { projectId, documentId } = req.params;
      const tenantId = (req as any).tenantId || 'default';

      const document = await this.documentRepository.findById(documentId, tenantId);
      
      if (!document || document.projectId !== projectId) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      await this.documentRepository.delete(documentId, tenantId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to delete document' 
      });
    }
  }

  async deleteAll(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const tenantId = (req as any).tenantId || 'default';

      if (!this.deleteAllHandler) {
        res.status(500).json({ error: 'Delete all handler not configured' });
        return;
      }

      const command = new DeleteAllProjectDocumentsCommand(tenantId, projectId);
      const result = await this.deleteAllHandler.handle(command);

      res.json({
        success: true,
        deletedDocumentsCount: result.deletedDocumentsCount,
        deletedEventsCount: result.deletedEventsCount,
      });
    } catch (error) {
      console.error('Error deleting all documents:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to delete all documents' 
      });
    }
  }
}
