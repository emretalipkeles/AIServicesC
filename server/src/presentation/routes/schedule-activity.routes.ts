import { randomUUID } from 'crypto';
import type { Express } from 'express';
import multer from 'multer';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { ScheduleActivityController } from '../controllers/ScheduleActivityController';
import { UploadScheduleCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadScheduleCommandHandler';
import { ListScheduleActivitiesQueryHandler } from '../../application/delay-analysis/queries/handlers/ListScheduleActivitiesQueryHandler';
import { RecordTokenUsageCommandHandler } from '../../application/delay-analysis/commands/handlers/RecordTokenUsageCommandHandler';
import { SSEProgressReporter } from '../../infrastructure/document-parsing/SSEProgressReporter';
import type { UploadScheduleCommand } from '../../application/delay-analysis/commands/UploadScheduleCommand';
import type { TokenUsageCallback, TokenUsageRecord } from '../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { uploadScheduleParamsSchema, uploadScheduleBodySchema } from '../validators/scheduleValidators';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/pdf',
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.pdf'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) or PDF files are allowed'));
    }
  },
});

export function registerScheduleActivityRoutes(app: Express, container: AppContainer): void {
  const uploadScheduleHandler = new UploadScheduleCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.repositories.scheduleActivity,
    container.services.scheduleParserFactory
  );

  const listActivitiesHandler = new ListScheduleActivitiesQueryHandler(
    container.repositories.scheduleActivity
  );

  const tokenUsageHandler = new RecordTokenUsageCommandHandler(
    container.repositories.aiTokenUsage
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

  app.post(
    '/api/delay-analysis/projects/:projectId/schedule/stream',
    upload.single('file'),
    async (req, res) => {
      try {
        const paramsResult = uploadScheduleParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          res.status(400).json({ error: paramsResult.error.message });
          return;
        }

        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const progressReporter = new SSEProgressReporter(res);
        const projectId = paramsResult.data.projectId;
        const runId = `schedule-upload-${randomUUID()}`;

        const tokenUsageCallback: TokenUsageCallback = async (usage: TokenUsageRecord) => {
          await tokenUsageHandler.handle({
            type: 'RecordTokenUsageCommand',
            projectId,
            runId: usage.runId,
            operation: usage.operation,
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            metadata: usage.metadata,
          });
        };

        const command: UploadScheduleCommand = {
          projectId,
          tenantId: 'default',
          file: {
            buffer: file.buffer,
            filename: file.originalname,
            contentType: file.mimetype,
          },
        };

        try {
          const result = await uploadScheduleHandler.execute(command, {
            progressReporter,
            tokenUsageCallback,
            runId,
          });

          progressReporter.complete('Upload complete', { ...result, runId });
        } catch (error) {
          progressReporter.error(
            error instanceof Error ? error.message : 'Upload failed',
            error instanceof Error ? error : undefined
          );
        }
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal server error',
          });
        }
      }
    }
  );
}
