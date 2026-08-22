import { randomUUID } from 'crypto';
import type { UploadScheduleCommand } from '../UploadScheduleCommand';
import type { IDelayAnalysisProjectRepository } from '../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { IScheduleActivityRepository } from '../../../../domain/delay-analysis/repositories/IScheduleActivityRepository';
import type { IScheduleParserFactory } from '../../../../domain/delay-analysis/interfaces/IScheduleParserFactory';
import type { IProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import { NoOpProgressReporter } from '../../../../domain/delay-analysis/interfaces/IProgressReporter';
import type { TokenUsageCallback } from '../../../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { ProjectDocument } from '../../../../domain/delay-analysis/entities/ProjectDocument';
import { ScheduleActivity } from '../../../../domain/delay-analysis/entities/ScheduleActivity';
import type { ParsedScheduleRow } from '../../../../domain/delay-analysis/interfaces/IExcelParser';

export interface UploadScheduleResult {
  documentId: string;
  activitiesImported: number;
  activitiesUpdated: number;
  activitiesSkipped: number;
  totalRowsProcessed: number;
  errors: string[];
  scheduleUpdateMonth: string | null;
}

export interface UploadScheduleOptions {
  progressReporter?: IProgressReporter;
  tokenUsageCallback?: TokenUsageCallback;
  runId?: string;
}

export class UploadScheduleCommandHandler {
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly scheduleRepository: IScheduleActivityRepository,
    private readonly parserFactory: IScheduleParserFactory
  ) {}

  async execute(
    command: UploadScheduleCommand, 
    options?: UploadScheduleOptions
  ): Promise<UploadScheduleResult> {
    const progress = options?.progressReporter || new NoOpProgressReporter();

    progress.report({
      stage: 'uploading',
      message: 'Starting schedule upload...',
      percentage: 0,
    });

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
    // Persisted before parsing starts so a mid-flight server restart leaves enough state for
    // StartupReconciliationService to retry the schedule instead of leaving it stuck forever.
    await this.documentRepository.setFileData(docId, command.tenantId, command.file.buffer);

    return this.processSchedule(document, command.file.buffer, command.projectId, command.tenantId, options, progress);
  }

  /**
   * Re-runs schedule processing for a document left in 'pending'/'processing' by an interrupted
   * server process, using the raw bytes persisted at upload time. Used by
   * StartupReconciliationService; not part of the normal upload path.
   */
  async reprocessDocument(
    document: ProjectDocument,
    buffer: Buffer,
    options?: UploadScheduleOptions
  ): Promise<UploadScheduleResult> {
    const progress = options?.progressReporter || new NoOpProgressReporter();
    return this.processSchedule(document, buffer, document.projectId, document.tenantId, options, progress);
  }

  private async processSchedule(
    document: ProjectDocument,
    buffer: Buffer,
    projectId: string,
    tenantId: string,
    options: UploadScheduleOptions | undefined,
    progress: IProgressReporter
  ): Promise<UploadScheduleResult> {
    const docId = document.id;
    const now = new Date();
    const parser = this.parserFactory.getParser(document.contentType, document.filename);
    if (!parser) {
      const updatedDoc = document.withProcessingStatus(
        'failed',
        `Unsupported file type: ${document.contentType}. Please upload an Excel (.xlsx, .xls) or PDF file.`
      );
      // update() clears retained file bytes atomically with the terminal status write - see
      // DrizzleProjectDocumentRepository.update.
      await this.documentRepository.update(updatedDoc);
      throw new Error(updatedDoc.errorMessage ?? 'Unsupported file type');
    }

    progress.report({
      stage: 'parsing_pdf',
      message: 'Parsing schedule file...',
      percentage: 5,
    });

    try {
      const parseResult = await parser.parseSchedule(
        buffer,
        document.filename,
        {
          filterActualOnly: true,
          progressReporter: progress,
          tokenUsageCallback: options?.tokenUsageCallback,
          runId: options?.runId,
        }
      );

      console.log(`[UploadScheduleHandler] Parse result: ${parseResult.rows.length} rows, ${parseResult.totalRowsProcessed} total processed`);
      console.log(`[UploadScheduleHandler] Parse errors: ${parseResult.errors.join('; ') || 'none'}`);

      if (parseResult.rows.length === 0) {
        console.log(`[UploadScheduleHandler] No rows returned from parser, returning early`);
        const updatedDoc = document.withProcessingStatus(
          'completed',
          `No activities with actual dates found. ${parseResult.errors.join('; ')}`
        );
        // update() clears retained file bytes atomically with the terminal status write - see
        // DrizzleProjectDocumentRepository.update.
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

      const scheduleMonth = parseResult.scheduleUpdateMonth || null;

      const deduplicatedRows = this.deduplicateByActivityId(parseResult.rows);
      
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const totalRows = deduplicatedRows.length;

      progress.report({
        stage: 'saving_activities',
        message: `Saving ${totalRows} activities to database...`,
        percentage: 85,
        details: { total: totalRows },
      });

      for (let i = 0; i < deduplicatedRows.length; i++) {
        const row = deduplicatedRows[i];
        const existing = await this.scheduleRepository.findByActivityId(
          projectId,
          tenantId,
          row.activityId
        );

        if (existing) {
          const hasChanges = this.hasActivityChanges(existing, row);
          
          if (hasChanges) {
            const updatedActivity = new ScheduleActivity({
              id: existing.id,
              projectId,
              tenantId,
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
              totalFloat: row.totalFloat,
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
            projectId,
            tenantId,
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
            totalFloat: row.totalFloat,
            metadata: null,
            createdAt: now,
          });
          await this.scheduleRepository.save(newActivity);
          imported++;
        }

        if ((i + 1) % 10 === 0 || i === totalRows - 1) {
          const saveProgress = 85 + ((i + 1) / totalRows) * 10;
          progress.report({
            stage: 'saving_activities',
            message: `Saved ${i + 1} of ${totalRows} activities...`,
            percentage: Math.round(saveProgress),
            details: {
              current: i + 1,
              total: totalRows,
            },
          });
        }
      }

      const updatedDoc = document.withProcessingStatus('completed');
      // update() clears retained file bytes atomically with the terminal status write - see
      // DrizzleProjectDocumentRepository.update.
      await this.documentRepository.update(updatedDoc);

      progress.report({
        stage: 'complete',
        message: `Complete! ${imported} new, ${updated} updated, ${skipped} unchanged`,
        percentage: 100,
        details: {
          current: totalRows,
          total: totalRows,
        },
      });

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
      // update() clears retained file bytes atomically with the terminal status write - see
      // DrizzleProjectDocumentRepository.update.
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

  private deduplicateByActivityId(rows: ParsedScheduleRow[]): ParsedScheduleRow[] {
    const seen = new Map<string, ParsedScheduleRow>();
    for (const row of rows) {
      seen.set(row.activityId, row);
    }
    return Array.from(seen.values());
  }
}
