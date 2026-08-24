import { randomUUID } from 'crypto';
import type { ProcessDiaryDocumentCommand } from '../ProcessDiaryDocumentCommand';
import type { IDiaryReportRepository } from '../../../../domain/delay-analysis/repositories/IDiaryReportRepository';
import type { IDiaryExtractionStrategy } from '../../../../domain/delay-analysis/interfaces/IDiaryExtractionStrategy';
import type { IAIClient } from '../../../../domain/interfaces/IAIClient';
import type { IProjectDocumentRepository } from '../../../../domain/delay-analysis/repositories/IProjectDocumentRepository';
import { AIMessage } from '../../../../domain/value-objects/AIMessage';
import { ModelId } from '../../../../domain/value-objects/ModelId';
import { DiaryReport, type DiaryEntry } from '../../../../domain/delay-analysis/entities/DiaryReport';
import { extractJsonObjectFromResponse } from '../../../../infrastructure/delay-analysis/AIJsonResponseParser';
import { coerceDiaryExtractionResponse, type CoercedDiaryDay } from '../../../../infrastructure/delay-analysis/diary/DiaryExtractionResponseValidator';
import { segmentDiaryText, isSegmentationReliable, type DiarySegmentDay } from '../../../../infrastructure/delay-analysis/diary/DiarySegmenter';
import { retryWithBackoff } from '../../../../infrastructure/delay-analysis/retryWithBackoff';

// Long diaries are chunked before the AI fallback so a single call stays within model limits.
// A generous overlap-free character budget; day/author blocks are usually far smaller than this.
const AI_FALLBACK_CHUNK_CHARS = 25000;

/**
 * Orchestrates Foreman Diary structured extraction: deterministic segmentation first, an AI
 * fallback pass only when segmentation's confidence signal says the layout didn't match, then
 * persistence. Mirrors ProcessPodDocumentCommandHandler's graceful-degradation contract: any
 * failure here is caught and logged, and the raw project_documents row from upload is never
 * invalidated. Every outcome (including "no dated entries found") is persisted onto the
 * source document's structuredExtractionStatus/Error/Summary fields.
 */
export class ProcessDiaryDocumentCommandHandler {
  static readonly type = 'ProcessDiaryDocumentCommand';

  constructor(
    private readonly diaryReportRepository: IDiaryReportRepository,
    private readonly strategy: IDiaryExtractionStrategy,
    private readonly aiClient: IAIClient | null,
    private readonly projectDocumentRepository?: IProjectDocumentRepository
  ) {}

  async execute(command: ProcessDiaryDocumentCommand): Promise<void> {
    const startedAt = Date.now();
    const logContext = `document=${command.documentId} project=${command.projectId} tenant=${command.tenantId}`;
    console.log(`[ProcessDiaryDocument] Starting diary segmentation (${logContext})`);

    try {
      const segmentation = segmentDiaryText(command.rawContent);
      let days: DiarySegmentDay[] | CoercedDiaryDay[] = segmentation.days;
      let extractionMethod: 'deterministic' | 'ai_fallback' = 'deterministic';

      if (!isSegmentationReliable(segmentation)) {
        console.log(
          `[ProcessDiaryDocument] Deterministic segmentation unreliable (${logContext}): ` +
          `datesFound=${segmentation.datesFound} entriesFound=${segmentation.entriesFound} ` +
          `unassigned=${segmentation.unassignedLineCount}/${segmentation.totalLineCount}. Falling back to AI.`
        );

        if (!this.aiClient) {
          const message = 'Deterministic segmentation was unreliable and no AI client is configured for fallback';
          console.error(`[ProcessDiaryDocument] ${message} (${logContext})`);
          await this.markFailed(command, message);
          return;
        }

        const fallbackDays = await this.runAiFallback(command);
        if (fallbackDays === null) {
          await this.markFailed(command, 'AI fallback extraction failed to produce a usable response');
          return;
        }
        days = fallbackDays;
        extractionMethod = 'ai_fallback';
      }

      if (days.length === 0) {
        const message = 'No dated diary entries could be found in this document';
        console.warn(`[ProcessDiaryDocument] ${message} (${logContext})`);
        await this.markFailed(command, message);
        return;
      }

      const reports = days.map((day, index) => new DiaryReport({
        id: randomUUID(),
        sourceDocumentId: command.documentId,
        projectId: command.projectId,
        tenantId: command.tenantId,
        reportDate: parseDateKeyAsUtc(day.date),
        sequence: index,
        extractionMethod,
        entries: day.entries as DiaryEntry[],
      }));

      await this.diaryReportRepository.saveReports(reports);

      const dates = reports.map(r => r.reportDate.toISOString().slice(0, 10)).sort();
      const summary = dates.length === 1
        ? `Split into 1 dated entry, ${dates[0]}`
        : `Split into ${dates.length} dated entries, ${dates[0]} to ${dates[dates.length - 1]}`;

      await this.markCompleted(command, summary);

      const durationMs = Date.now() - startedAt;
      console.log(
        `[ProcessDiaryDocument] Completed diary extraction (${logContext}): ${summary} (${extractionMethod}), ${durationMs}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown extraction error';
      console.error(`[ProcessDiaryDocument] Failed diary extraction (${logContext})`, error);
      await this.markFailed(command, message);
    }
  }

  /** Returns null (not an empty array) when the AI fallback itself fails, so it is distinguishable from "ran cleanly, found nothing". */
  private async runAiFallback(command: ProcessDiaryDocumentCommand): Promise<CoercedDiaryDay[] | null> {
    if (!this.aiClient) return null;

    const chunks = chunkText(command.rawContent, AI_FALLBACK_CHUNK_CHARS);
    const daysByDate = new Map<string, CoercedDiaryDay>();
    let anyChunkSucceeded = false;

    for (const chunk of chunks) {
      const { prompt } = this.strategy.buildExtractionPrompt({
        documentContent: chunk,
        documentFilename: command.filename,
        documentId: command.documentId,
      });

      try {
        const response = await retryWithBackoff(() =>
          this.aiClient!.chat({
            model: ModelId.gpt54(),
            messages: [AIMessage.user(prompt)],
            maxTokens: 4000,
            temperature: 0,
          })
        );

        const parsedJson = extractJsonObjectFromResponse(response.content);
        if (!parsedJson) continue;

        const coerced = coerceDiaryExtractionResponse(parsedJson);
        if (!coerced) continue;

        anyChunkSucceeded = true;
        for (const day of coerced.days) {
          const existing = daysByDate.get(day.date);
          if (existing) {
            existing.entries.push(...day.entries.map((entry, i) => ({ ...entry, sequence: existing.entries.length + i })));
          } else {
            daysByDate.set(day.date, day);
          }
        }
      } catch (error) {
        console.error(`[ProcessDiaryDocument] AI fallback chunk failed for document=${command.documentId}`, error);
      }
    }

    if (!anyChunkSucceeded) return null;

    return Array.from(daysByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  private async markCompleted(command: ProcessDiaryDocumentCommand, summary: string): Promise<void> {
    await this.persistStatus(command, 'completed', undefined, summary);
  }

  private async markFailed(command: ProcessDiaryDocumentCommand, message: string): Promise<void> {
    await this.persistStatus(command, 'failed', message);
  }

  private async persistStatus(
    command: ProcessDiaryDocumentCommand,
    status: 'completed' | 'failed',
    error?: string,
    summary?: string
  ): Promise<void> {
    if (!this.projectDocumentRepository) return;
    try {
      const document = await this.projectDocumentRepository.findById(command.documentId, command.tenantId);
      if (!document) return;
      await this.projectDocumentRepository.update(
        document.withStructuredExtractionStatus(status, error, summary)
      );
    } catch (persistError) {
      console.error(
        `[ProcessDiaryDocument] Failed to persist structured extraction status for document=${command.documentId}`,
        persistError
      );
    }
  }
}

/** Splits text into contiguous chunks of at most maxChars, breaking on line boundaries so a day/block is rarely split mid-line. */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length + 1 > maxChars && current.length > 0) {
      chunks.push(current.join('\n'));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }
  if (current.length > 0) chunks.push(current.join('\n'));

  return chunks;
}

function parseDateKeyAsUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
