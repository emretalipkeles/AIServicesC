import type { Request, Response } from 'express';
import type { UploadScheduleCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadScheduleCommandHandler';
import type { ListScheduleActivitiesQueryHandler } from '../../application/delay-analysis/queries/handlers/ListScheduleActivitiesQueryHandler';
import type { IScheduleActivityRepository } from '../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import {
  uploadScheduleParamsSchema,
  uploadScheduleBodySchema,
  listScheduleActivitiesParamsSchema,
  deleteScheduleActivityParamsSchema,
} from '../validators/scheduleValidators';

const DEFAULT_TENANT_ID = 'default';

export class ScheduleActivityController {
  constructor(
    private readonly uploadScheduleHandler: UploadScheduleCommandHandler,
    private readonly listActivitiesHandler: ListScheduleActivitiesQueryHandler,
    private readonly scheduleRepository: IScheduleActivityRepository
  ) {}

  async uploadSchedule(req: Request, res: Response): Promise<void> {
    try {
      const params = uploadScheduleParamsSchema.parse(req.params);
      const body = uploadScheduleBodySchema.parse(req.body);

      if (!req.file) {
        res.status(400).json({ 
          success: false, 
          error: 'No file uploaded. Please upload an Excel (.xlsx, .xls) or PDF file.' 
        });
        return;
      }

      const result = await this.uploadScheduleHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        file: {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
          buffer: req.file.buffer,
        },
        targetMonth: body.targetMonth,
        targetYear: body.targetYear,
      });

      res.status(201).json({
        success: true,
        data: {
          documentId: result.documentId,
          activitiesImported: result.activitiesImported,
          activitiesUpdated: result.activitiesUpdated,
          activitiesSkipped: result.activitiesSkipped,
          totalRowsProcessed: result.totalRowsProcessed,
          scheduleUpdateMonth: result.scheduleUpdateMonth,
          warnings: result.errors.length > 0 ? result.errors : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ success: false, error: 'Invalid request parameters' });
        return;
      }
      
      console.error('Error uploading schedule:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload schedule',
      });
    }
  }

  async listActivities(req: Request, res: Response): Promise<void> {
    try {
      const params = listScheduleActivitiesParamsSchema.parse(req.params);

      const activities = await this.listActivitiesHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
      });

      res.json({
        success: true,
        data: activities,
        count: activities.length,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ success: false, error: 'Invalid request parameters' });
        return;
      }

      console.error('Error listing schedule activities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list schedule activities',
      });
    }
  }

  async deleteActivity(req: Request, res: Response): Promise<void> {
    try {
      const params = deleteScheduleActivityParamsSchema.parse(req.params);

      const activity = await this.scheduleRepository.findById(params.activityId, DEFAULT_TENANT_ID);
      
      if (!activity) {
        res.status(404).json({ success: false, error: 'Activity not found' });
        return;
      }

      if (activity.projectId !== params.projectId) {
        res.status(404).json({ success: false, error: 'Activity not found in this project' });
        return;
      }

      res.json({ success: true, message: 'Activity deleted' });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ success: false, error: 'Invalid request parameters' });
        return;
      }

      console.error('Error deleting activity:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete activity',
      });
    }
  }

  async deleteAllByProject(req: Request, res: Response): Promise<void> {
    try {
      const params = listScheduleActivitiesParamsSchema.parse(req.params);

      await this.scheduleRepository.deleteByProjectId(params.projectId, DEFAULT_TENANT_ID);

      res.json({ success: true, message: 'All activities deleted' });
    } catch (error) {
      console.error('Error deleting all activities:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete activities',
      });
    }
  }
}
