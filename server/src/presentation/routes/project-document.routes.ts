import type { Express } from 'express';
import multer from 'multer';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { ProjectDocumentController } from '../controllers/ProjectDocumentController';
import { UploadDocumentsCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadDocumentsCommandHandler';
import { ListProjectDocumentsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListProjectDocumentsQueryHandler';

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
  const uploadHandler = new UploadDocumentsCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.services.documentParserFactory
  );

  const listHandler = new ListProjectDocumentsQueryHandler(
    container.repositories.projectDocument
  );

  const controller = new ProjectDocumentController(
    uploadHandler,
    listHandler,
    container.repositories.projectDocument
  );

  app.post(
    '/api/delay-analysis/projects/:projectId/documents',
    upload.array('files', 50),
    (req, res) => controller.upload(req, res)
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
}
