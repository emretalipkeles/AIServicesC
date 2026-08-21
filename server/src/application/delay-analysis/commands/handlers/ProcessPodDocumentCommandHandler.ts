import { randomUUID } from 'crypto';
import type { ProcessPodDocumentCommand } from '../ProcessPodDocumentCommand';
import type { IPodReportRepository } from '../../../../domain/delay-analysis/repositories/IPodReportRepository';
import type { IPodExtractionStrategy } from '../../../../domain/delay-analysis/interfaces/IPodExtractionStrategy';
import type { IAIClient } from '../../../../domain/interfaces/IAIClient';
import { AIMessage } from '../../../../domain/value-objects/AIMessage';
import { ModelId } from '../../../../domain/value-objects/ModelId';
import { PodReport } from '../../../../domain/delay-analysis/entities/PodReport';
import { extractJsonObjectFromResponse } from '../../../../infrastructure/delay-analysis/AIJsonResponseParser';
import { coercePodExtractionResponse } from '../../../../infrastructure/delay-analysis/pod/PodExtractionResponseValidator';

/**
 * Orchestrates POD structured extraction: strategy -> AI call -> validation -> persistence.
 *
 * Graceful degradation is the whole point of this handler: any failure here (bad AI
 * response, transaction error, unparseable output) is caught and logged, and the caller's
 * document upload/completion flow is never affected. A POD upload always keeps its raw
 * project_documents row even when this handler fails outright.
 */
export class ProcessPodDocumentCommandHandler {
  static readonly type = 'ProcessPodDocumentCommand';

  constructor(
    private readonly podReportRepository: IPodReportRepository,
    private readonly strategy: IPodExtractionStrategy,
    private readonly aiClient: IAIClient
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

      const response = await this.aiClient.chat({
        model: ModelId.gpt54(),
        messages: [AIMessage.user(prompt)],
        maxTokens: 4000,
        temperature: 0,
      });

      const parsedJson = extractJsonObjectFromResponse(response.content);
      if (!parsedJson) {
        console.error(`[ProcessPodDocument] AI response was not valid JSON (${logContext})`);
        return;
      }

      const coerced = coercePodExtractionResponse(parsedJson);
      if (!coerced) {
        console.error(`[ProcessPodDocument] AI response failed schema validation (${logContext})`);
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

      const childCount = report.sections.reduce(
        (sum, section) => sum + section.crewMembers.length + section.equipment.length + section.taskLines.length,
        0
      );
      const durationMs = Date.now() - startedAt;
      console.log(
        `[ProcessPodDocument] Completed POD extraction (${logContext}): ${report.sections.length} sections, ${childCount} child rows, ${durationMs}ms`
      );
    } catch (error) {
      console.error(`[ProcessPodDocument] Failed POD extraction (${logContext})`, error);
    }
  }
}
