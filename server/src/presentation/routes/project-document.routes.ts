import type { Express } from 'express';
import multer from 'multer';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { ProjectDocumentController } from '../controllers/ProjectDocumentController';
import { ListProjectDocumentsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListProjectDocumentsQueryHandler';
import { DeleteAllProjectDocumentsCommandHandler } from '../../application/delay-analysis/commands/handlers/DeleteAllProjectDocumentsCommandHandler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 50,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

export function registerProjectDocumentRoutes(app: Express, container: AppContainer): void {
  // Shared with StartupReconciliationService so retried documents go through the exact same
  // handler instance (concurrency limiter included) as normal uploads.
  const uploadHandler = container.documentUpload.uploadDocumentsHandler;

  const listHandler = new ListProjectDocumentsQueryHandler(
    container.repositories.projectDocument
  );

  const deleteAllHandler = new DeleteAllProjectDocumentsCommandHandler(
    container.repositories.projectDocument,
    container.repositories.contractorDelayEvent
  );

  const controller = new ProjectDocumentController(
    uploadHandler,
    listHandler,
    container.repositories.projectDocument,
    deleteAllHandler
  );

  app.post(
    '/api/delay-analysis/projects/:projectId/documents',
    upload.array('files', 50),
    (req, res) => controller.upload(req, res)
  );

  app.post(
    '/api/delay-analysis/projects/:projectId/documents/check-duplicates',
    (req, res) => controller.checkDuplicates(req, res)
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/documents',
    (req, res) => controller.list(req, res)
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/documents/:documentId',
    (req, res) => controller.getById(req, res)
  );

  app.delete(
    '/api/delay-analysis/projects/:projectId/documents/:documentId',
    (req, res) => controller.delete(req, res)
  );

  app.delete(
    '/api/delay-analysis/projects/:projectId/documents',
    (req, res) => controller.deleteAll(req, res)
  );
}
