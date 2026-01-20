import { randomUUID } from 'crypto';
import type { UploadScheduleCommand } from '../UploadScheduleCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IScheduleParserFactory } from '../../../../domain/delay-analysis/interfaces/IScheduleParserFactory';
import { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';

export interface UploadScheduleResult {
  documentId: string;
  activitiesImported: number;
  activitiesUpdated: number;
  activitiesSkipped: number;
  totalRowsProcessed: number;
  errors: string[];
  scheduleUpdateMonth: string | null;
}

export class UploadScheduleCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly parserFactory: IScheduleParserFactory
  ) {}

  async execute(command: UploadScheduleCommand): Promise<UploadScheduleResult> {
    const project = await this.projectRepository.findById(command.projectId, command.tenantId);
    if (!project) {
      throw new Error(`Project ${command.projectId} not found`);
    }

    const parser = this.parserFactory.getParser(command.file.contentType, command.file.filename);
    if (!parser) {
      throw new Error(`Unsupported file type: ${command.file.contentType}. Please upload an Excel (.xlsx, .xls) or PDF file.`);
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
      const parseResult = await parser.parseSchedule(
        command.file.buffer,
        command.file.filename,
        {
          targetMonth: command.targetMonth,
          targetYear: command.targetYear,
          filterActualOnly: true,
        }
      );

      if (parseResult.rows.length === 0) {
        const updatedDoc = document.withProcessingStatus(
          'completed',
          `No activities with actual dates found for ${command.targetMonth}/${command.targetYear}. ${parseResult.errors.join('; ')}`
        );
        await this.documentRepository.update(updatedDoc);

        return {
          documentId: docId,
          activitiesImported: 0,
          activitiesUpdated: 0,
          activitiesSkipped: 0,
          totalRowsProcessed: parseResult.totalRowsProcessed,
          errors: parseResult.errors,
          scheduleUpdateMonth: parseResult.scheduleUpdateMonth,
        };
      }

      const scheduleMonth = parseResult.scheduleUpdateMonth || 
        `${command.targetYear}-${String(command.targetMonth).padStart(2, '0')}`;

      let imported = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of parseResult.rows) {
        const existing = await this.scheduleRepository.findByActivityId(
          command.projectId,
          command.tenantId,
          row.activityId
        );

        if (existing) {
          const hasChanges = this.hasActivityChanges(existing, row);
          
          if (hasChanges) {
            const updatedActivity = new ScheduleActivity({
              id: existing.id,
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
              createdAt: existing.createdAt,
            });
            await this.scheduleRepository.save(updatedActivity);
            updated++;
          } else {
            skipped++;
          }
        } else {
          const newActivity = new ScheduleActivity({
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
          await this.scheduleRepository.save(newActivity);
          imported++;
        }
      }

      const updatedDoc = document.withProcessingStatus('completed');
      await this.documentRepository.update(updatedDoc);

      return {
        documentId: docId,
        activitiesImported: imported,
        activitiesUpdated: updated,
        activitiesSkipped: skipped,
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

  private hasActivityChanges(
    existing: ScheduleActivity,
    newRow: {
      actualStartDate: Date | null;
      actualFinishDate: Date | null;
      activityDescription: string;
    }
  ): boolean {
    const datesDiffer = (a: Date | null, b: Date | null): boolean => {
      if (a === null && b === null) return false;
      if (a === null || b === null) return true;
      return a.getTime() !== b.getTime();
    };

    return (
      datesDiffer(existing.actualStartDate, newRow.actualStartDate) ||
      datesDiffer(existing.actualFinishDate, newRow.actualFinishDate) ||
      existing.activityDescription !== newRow.activityDescription
    );
  }
}
