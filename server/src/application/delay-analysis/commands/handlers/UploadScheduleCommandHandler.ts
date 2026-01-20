import { randomUUID } from 'crypto';
import type { UploadScheduleCommand } from '../UploadScheduleCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IExcelParser } from '../../../../domain/delay-analysis/interfaces/IExcelParser';
import { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';

export interface UploadScheduleResult {
  documentId: string;
  activitiesImported: number;
  totalRowsProcessed: number;
  errors: string[];
  scheduleUpdateMonth: string | null;
}

export class UploadScheduleCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly excelParser: IExcelParser
  ) {}

  async execute(command: UploadScheduleCommand): Promise<UploadScheduleResult> {
    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      throw new Error(`Project ${command.projectId} not found`);
    }

    if (!this.excelParser.canParse(command.file.contentType)) {
      throw new Error(`Unsupported file type: ${command.file.contentType}. Please upload an Excel file (.xlsx or .xls)`);
    }

    const docId = randomUUID();
    const now = new Date();

    const document = new ProjectDocument({
      id: docId,
      projectId: command.projectId,
      tenantId: command.tenantId,
      filename: command.file.filename,
      contentType: command.file.contentType,
      documentType: 'cpm_schedule',
      rawContent: null,
      reportDate: null,
      status: 'processing',
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    });

    await this.documentRepository.save(document);

    try {
      const parseResult = await this.excelParser.parseSchedule(
        command.file.buffer,
        command.file.filename
      );

      if (parseResult.rows.length === 0) {
        const updatedDoc = document.withProcessingStatus(
          'failed',
          `No activities found. ${parseResult.errors.join('; ')}`
        );
        await this.documentRepository.update(updatedDoc);

        return {
          documentId: docId,
          activitiesImported: 0,
          totalRowsProcessed: parseResult.totalRowsProcessed,
          errors: parseResult.errors,
          scheduleUpdateMonth: null,
        };
      }

      const scheduleMonth = command.scheduleUpdateMonth || parseResult.scheduleUpdateMonth;

      const activities: ScheduleActivity[] = parseResult.rows.map(row => {
        return new ScheduleActivity({
          id: randomUUID(),
          projectId: command.projectId,
          tenantId: command.tenantId,
          sourceDocumentId: docId,
          activityId: row.activityId,
          wbs: row.wbs,
          activityDescription: row.activityDescription,
          plannedStartDate: row.plannedStartDate,
          plannedFinishDate: row.plannedFinishDate,
          actualStartDate: row.actualStartDate,
          actualFinishDate: row.actualFinishDate,
          scheduleUpdateMonth: scheduleMonth,
          isCriticalPath: row.isCriticalPath,
          metadata: null,
          createdAt: now,
        });
      });

      await this.scheduleRepository.saveBatch(activities);

      const updatedDoc = document.withProcessingStatus('completed');
      await this.documentRepository.update(updatedDoc);

      return {
        documentId: docId,
        activitiesImported: activities.length,
        totalRowsProcessed: parseResult.totalRowsProcessed,
        errors: parseResult.errors,
        scheduleUpdateMonth: scheduleMonth,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during parsing';
      const updatedDoc = document.withProcessingStatus('failed', errorMessage);
      await this.documentRepository.update(updatedDoc);

      throw error;
    }
  }
}
