import type { Express } from 'express';
import multer from 'multer';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { ScheduleActivityController } from '../controllers/ScheduleActivityController';
import { UploadScheduleCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadScheduleCommandHandler';
import { ListScheduleActivitiesQueryHandler } from '../../application/delay-analysis/queries/handlers/ListScheduleActivitiesQueryHandler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
});

export function registerScheduleActivityRoutes(app: Express, container: AppContainer): void {
  const uploadScheduleHandler = new UploadScheduleCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.repositories.scheduleActivity,
    container.services.excelParser
  );

  const listActivitiesHandler = new ListScheduleActivitiesQueryHandler(
    container.repositories.scheduleActivity
  );

  const controller = new ScheduleActivityController(
    uploadScheduleHandler,
    listActivitiesHandler,
    container.repositories.scheduleActivity
  );

  app.post(
    '/api/delay-analysis/projects/:projectId/schedule',
    upload.single('file'),
    (req, res) => controller.uploadSchedule(req, res)
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/schedule/activities',
    (req, res) => controller.listActivities(req, res)
  );

  app.delete(
    '/api/delay-analysis/projects/:projectId/schedule/activities/:activityId',
    (req, res) => controller.deleteActivity(req, res)
  );

  app.delete(
    '/api/delay-analysis/projects/:projectId/schedule/activities',
    (req, res) => controller.deleteAllByProject(req, res)
  );
}
