import { randomUUID } from 'crypto';
import type { ProcessPodDocumentCommand } from '../ProcessPodDocumentCommand';
import type { IPodReportRepository } from '../../../../domain/delay-analysis/repositories/IPodReportRepository';
import type { IPodExtractionStrategy } from '../../../../domain/delay-analysis/interfaces/IPodExtractionStrategy';
import type { IAIClient } from '../../../../domain/interfaces/IAIClient';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import { AIMessage } from '../../../../domain/value-objects/AIMessage';
import { ModelId } from '../../../../domain/value-objects/ModelId';
import { PodReport } from '../../../../domain/delay-analysis/entities/PodReport';
import { extractJsonObjectFromResponse } from '../../../../infrastructure/delay-analysis/AIJsonResponseParser';
import { coercePodExtractionResponse } from '../../../../infrastructure/delay-analysis/pod/PodExtractionResponseValidator';
import { retryWithBackoff } from '../../../../infrastructure/delay-analysis/retryWithBackoff';

/**
 * Orchestrates POD structured extraction: strategy -> AI call -> validation -> persistence.
 *
 * Graceful degradation is the whole point of this handler: any failure here (bad AI
 * response, transaction error, unparseable output) is caught and logged, and the caller's
 * document upload/completion flow is never affected. A POD upload always keeps its raw
 * project_documents row even when this handler fails outright.
 *
 * Failures are no longer *silent*, though: every outcome is persisted onto the source
 * project_documents row (structuredExtractionStatus/Error) so a document whose raw parse
 * succeeded but whose structured extraction failed is discoverable (e.g. for a backfill),
 * instead of looking identical to a fully-processed one.
 */
export class ProcessPodDocumentCommandHandler {
  static readonly type = 'ProcessPodDocumentCommand';

  constructor(
    private readonly podReportRepository: IPodReportRepository,
    private readonly strategy: IPodExtractionStrategy,
    private readonly aiClient: IAIClient,
    private readonly projectDocumentRepository?: IProjectDocumentRepository
  ) {}

  async execute(command: ProcessPodDocumentCommand): Promise<void> {
    const startedAt = Date.now();
    const logContext = `document=${command.documentId} project=${command.projectId} tenant=${command.tenantId}`;
    console.log(`[ProcessPodDocument] Starting POD extraction (${logContext})`);

    try {
      const { prompt } = this.strategy.buildExtractionPrompt({
        documentContent: command.rawContent,
        documentFilename: command.filename,
        documentId: command.documentId,
      });

      // Retried because unbounded-concurrency uploads can trip the AI provider's rate
      // limits; a transient 429/5xx should not permanently drop the extraction.
      // temperature is omitted: gpt-5.6-terra rejects any non-default temperature
      // outright, confirmed live and independent of whether reasoning_effort is set, so
      // determinism comes from reasoning_effort instead. See
      // .agents/memory/reasoning-model-openai-client.md.
      const response = await retryWithBackoff(() =>
        this.aiClient.chat({
          model: ModelId.gpt54(),
          messages: [AIMessage.user(prompt)],
          maxTokens: 16000,
        })
      );

      const parsedJson = extractJsonObjectFromResponse(response.content);
      if (!parsedJson) {
        const message = 'AI response was not valid JSON';
        console.error(`[ProcessPodDocument] ${message} (${logContext})`);
        await this.markFailed(command, message);
        return;
      }

      const coerced = coercePodExtractionResponse(parsedJson);
      if (!coerced) {
        const message = 'AI response failed schema validation';
        console.error(`[ProcessPodDocument] ${message} (${logContext})`);
        await this.markFailed(command, message);
        return;
      }

      const reportDate = coerced.reportDate ?? command.fallbackReportDate ?? null;

      const report = new PodReport({
        id: randomUUID(),
        sourceDocumentId: command.documentId,
        projectId: command.projectId,
        tenantId: command.tenantId,
        reportDate,
        title: coerced.title,
        sections: coerced.sections,
      });

      await this.podReportRepository.saveReport(report);
      await this.markCompleted(command);

      const childCount = report.sections.reduce(
        (sum, section) => sum + section.crewMembers.length + section.equipment.length + section.taskLines.length,
        0
      );
      const durationMs = Date.now() - startedAt;
      console.log(
        `[ProcessPodDocument] Completed POD extraction (${logContext}): ${report.sections.length} sections, ${childCount} child rows, ${durationMs}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown extraction error';
      console.error(`[ProcessPodDocument] Failed POD extraction (${logContext})`, error);
      await this.markFailed(command, message);
    }
  }

  private async markCompleted(command: ProcessPodDocumentCommand): Promise<void> {
    await this.persistStatus(command, 'completed');
  }

  private async markFailed(command: ProcessPodDocumentCommand, message: string): Promise<void> {
    await this.persistStatus(command, 'failed', message);
  }

  private async persistStatus(
    command: ProcessPodDocumentCommand,
    status: 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    if (!this.projectDocumentRepository) return;
    try {
      const document = await this.projectDocumentRepository.findById(command.documentId, command.tenantId);
      if (!document) return;
      await this.projectDocumentRepository.update(
        document.withStructuredExtractionStatus(status, error)
      );
    } catch (persistError) {
      console.error(
        `[ProcessPodDocument] Failed to persist structured extraction status for document=${command.documentId}`,
        persistError
      );
    }
  }
}
