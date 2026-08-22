import type { IProjectDocumentRepository } from '../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import type { UploadDocumentsCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadDocumentsCommandHandler';
import type { UploadScheduleCommandHandler } from '../../application/delay-analysis/commands/handlers/UploadScheduleCommandHandler';
import { ProjectDocument } from '../../domain/delay-analysis/entities/ProjectDocument';

// A document is retried at most this many times before reconciliation gives up and marks it
// failed outright - guards against a document whose processing itself crashes the server,
// which would otherwise wedge the app in a permanent "restart -> retry -> crash" loop.
const MAX_RECONCILIATION_ATTEMPTS = 3;

/**
 * Documents and schedules are parsed/AI-extracted entirely in-memory during a single async
 * call with no persistent job queue. If the server process restarts or crashes mid-upload,
 * the row is left in 'pending'/'processing' forever with no error and no retry.
 *
 * This service runs once at startup (there is no other reliable signal - a single-process app
 * cannot itself distinguish "still running" from "died and got restarted"). Anything found in
 * 'pending'/'processing' at that point can only be a leftover from a previous process, because
 * the current process has not yet had a chance to create any of its own. For each one:
 *   - If the original file bytes are still available, resume processing from scratch.
 *   - Otherwise (or once MAX_RECONCILIATION_ATTEMPTS is exceeded), mark it 'failed' with a
 *     clear message so the UI surfaces it for manual re-upload instead of leaving it stuck.
 */
export class StartupReconciliationService {
  constructor(
    private readonly documentRepository: IProjectDocumentRepository,
    private readonly uploadDocumentsHandler: UploadDocumentsCommandHandler,
    private readonly uploadScheduleHandler: UploadScheduleCommandHandler
  ) {}

  async reconcile(): Promise<void> {
    const stuck = await this.documentRepository.findAllStuckProcessing();
    if (stuck.length === 0) return;

    console.warn(
      `[StartupReconciliation] Found ${stuck.length} document(s) left in pending/processing by an interrupted process`
    );

    for (const info of stuck) {
      try {
        if (!info.hasFileData) {
          await this.markFailed(
            info.id,
            info.tenantId,
            'Processing was interrupted by a server restart and the original file was not retained. Please re-upload this document.'
          );
          continue;
        }

        if (info.processingAttempts >= MAX_RECONCILIATION_ATTEMPTS) {
          await this.markFailed(
            info.id,
            info.tenantId,
            `Processing failed after ${info.processingAttempts} attempts, each interrupted by a server restart. Please re-upload this document.`
          );
          continue;
        }

        const attempts = await this.documentRepository.incrementProcessingAttempts(info.id, info.tenantId);
        const buffer = await this.documentRepository.getFileData(info.id, info.tenantId);
        if (!buffer) {
          // Bytes disappeared between the listing query and now - treat like "no file data".
          await this.markFailed(
            info.id,
            info.tenantId,
            'Processing was interrupted by a server restart and the original file was not retained. Please re-upload this document.'
          );
          continue;
        }

        console.log(
          `[StartupReconciliation] Retrying ${info.documentType} document "${info.filename}" (attempt ${attempts}/${MAX_RECONCILIATION_ATTEMPTS})`
        );

        const document = await this.documentRepository.findById(info.id, info.tenantId);
        if (!document) continue;

        if (info.documentType === 'cpm_schedule') {
          // Fire-and-forget: schedule reprocessing can take a while and reconciliation must
          // not block server startup on it.
          this.uploadScheduleHandler.reprocessDocument(document, buffer).catch((error) => {
            console.error(`[StartupReconciliation] Schedule reprocessing failed for ${info.filename}:`, error);
          });
        } else {
          this.uploadDocumentsHandler.reprocessDocument(document, buffer).catch((error) => {
            console.error(`[StartupReconciliation] Document reprocessing failed for ${info.filename}:`, error);
          });
        }
      } catch (error) {
        console.error(`[StartupReconciliation] Failed to reconcile document ${info.id}:`, error);
      }
    }
  }

  private async markFailed(id: string, tenantId: string, message: string): Promise<void> {
    const document = await this.documentRepository.findById(id, tenantId);
    if (!document) return;
    // update() clears retained file bytes atomically with the terminal status write - see
    // DrizzleProjectDocumentRepository.update.
    await this.documentRepository.update(document.withProcessingStatus('failed', message));
  }
}
