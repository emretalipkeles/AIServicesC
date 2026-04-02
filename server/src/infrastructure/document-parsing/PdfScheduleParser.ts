import { PDFParse } from 'pdf-parse';
import type { ParsedScheduleRow } from '../../domain/delay-analysis/interfaces/IExcelParser';
import type { 
  IScheduleParser, 
  ScheduleParseOptions, 
  ScheduleParseResult 
} from '../../domain/delay-analysis/interfaces/IScheduleParser';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import type { TokenUsageCallback } from '../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';
import { NoOpProgressReporter } from '../../domain/delay-analysis/interfaces/IProgressReporter';

export class PdfScheduleParser implements IScheduleParser {
  private readonly supportedContentTypes = ['application/pdf'];
  private readonly supportedExtensions = ['.pdf'];

  constructor(private readonly aiClient: IAIClient) {}

  canParse(contentType: string, filename: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return this.supportedContentTypes.includes(contentType) || 
           this.supportedExtensions.includes(ext);
  }

  async parseSchedule(
    buffer: Buffer, 
    filename: string,
    options: ScheduleParseOptions
  ): Promise<ScheduleParseResult> {
    const errors: string[] = [];
    const rows: ParsedScheduleRow[] = [];
    const progress = options.progressReporter || new NoOpProgressReporter();

    try {
      progress.report({
        stage: 'extracting_text',
        message: 'Extracting text from PDF...',
        percentage: 5,
      });

      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const fullText = pdfData.text;
      await parser.destroy();

      progress.report({
        stage: 'filtering_dates',
        message: `Preparing PDF text for AI analysis...`,
        percentage: 15,
      });

      const textToProcess = this.extractAllActivitiesSection(fullText);
      const chunks = this.chunkText(textToProcess, 5000);

      console.log(`[PdfScheduleParser] Split ${textToProcess.length} chars into ${chunks.length} chunks for AI extraction`);

      if (textToProcess.trim().length === 0) {
        progress.report({
          stage: 'complete',
          message: 'No text content found in PDF',
          percentage: 100,
        });
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: [`No text content found in PDF. The document may not contain recognizable CPM schedule activity data.`],
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }

      progress.report({
        stage: 'ai_processing',
        message: `Sending ${chunks.length} text chunks to AI for activity extraction...`,
        percentage: 20,
        details: { total: chunks.length },
      });

      let chunkErrors = 0;
      for (let i = 0; i < chunks.length; i++) {
        const batchProgress = 20 + ((i + 1) / chunks.length) * 60;
        progress.report({
          stage: 'processing_batch',
          message: `AI analyzing chunk ${i + 1} of ${chunks.length}...`,
          percentage: Math.round(batchProgress),
          details: {
            batchNumber: i + 1,
            totalBatches: chunks.length,
            current: rows.length,
          },
        });

        try {
          const batchRows = await this.parseChunkWithAI(
            chunks[i],
            options,
            options.tokenUsageCallback,
            options.runId,
            i + 1
          );
          rows.push(...batchRows);
        } catch (batchError) {
          chunkErrors++;
          errors.push(`Chunk ${i + 1}: ${batchError instanceof Error ? batchError.message : 'Parse error'}`);
        }
      }

      const errorRate = chunks.length > 0 ? chunkErrors / chunks.length : 0;
      if (errorRate > 0.5) {
        errors.push(`High chunk error rate (${chunkErrors}/${chunks.length} failed). Extraction may be incomplete.`);
        console.warn(`[PdfScheduleParser] WARNING: ${chunkErrors}/${chunks.length} chunks failed (${Math.round(errorRate * 100)}% error rate)`);
      }

      const seenActivityIds = new Set<string>();
      const deduplicatedRows: ParsedScheduleRow[] = [];
      for (const row of rows) {
        if (!seenActivityIds.has(row.activityId)) {
          seenActivityIds.add(row.activityId);
          deduplicatedRows.push(row);
        }
      }

      const filteredRows = options.filterActualOnly !== false
        ? deduplicatedRows.filter(r => r.actualStartDate !== null || r.actualFinishDate !== null)
        : deduplicatedRows;

      console.log(`[PdfScheduleParser] AI extracted ${rows.length} total activities, ${deduplicatedRows.length} after dedup, ${filteredRows.length} with actual dates`);

      return {
        rows: filteredRows,
        scheduleUpdateMonth: null,
        errors,
        totalRowsProcessed: rows.length,
        successfulRows: filteredRows.length,
      };
    } catch (error) {
      return {
        rows: [],
        scheduleUpdateMonth: null,
        errors: [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRowsProcessed: 0,
        successfulRows: 0,
      };
    }
  }

  private chunkText(text: string, maxChunkSize: number, overlapLines: number = 15): string[] {
    const lines = text.split('\n');
    const chunks: string[] = [];
    let startIdx = 0;

    while (startIdx < lines.length) {
      let currentChunk = '';
      let endIdx = startIdx;

      while (endIdx < lines.length) {
        const nextLine = lines[endIdx];
        if (currentChunk.length + nextLine.length + 1 > maxChunkSize && currentChunk.length > 0) {
          break;
        }
        currentChunk += (currentChunk.length > 0 ? '\n' : '') + nextLine;
        endIdx++;
      }

      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
      }

      if (endIdx >= lines.length) break;

      startIdx = Math.max(startIdx + 1, endIdx - overlapLines);
    }

    return chunks;
  }

  private async parseChunkWithAI(
    textChunk: string,
    options: ScheduleParseOptions,
    tokenUsageCallback?: TokenUsageCallback,
    runId?: string,
    chunkNumber?: number
  ): Promise<ParsedScheduleRow[]> {
    const prompt = `You are parsing raw text extracted from a CPM (Critical Path Method) construction schedule PDF. Your job is to find and extract ALL schedule activities that have actual dates.

## HOW TO IDENTIFY ACTIVITIES
- Each activity row typically has: an Activity ID, a description, duration values, and date columns
- Activity IDs can be in any alphanumeric format: "1-W-0036", "PROC-0005", "DSC-023", "FM0009", "4-PH-1460A", "M-9000", etc.
- Ignore headers, footers, legends, page numbers, column labels, and any non-activity text

## HOW TO IDENTIFY ACTUAL DATES
- In CPM schedules, dates followed by "A" indicate ACTUAL dates (e.g., "07-Nov-24 A" means actual date November 7, 2024)
- The "A" marker may appear immediately after the date or separated by whitespace
- Dates WITHOUT an "A" marker are planned/baseline dates
- Dates may appear in formats: DD-Mon-YY, DD/MM/YY, Mon-DD-YY, MM/DD/YY, YYYY-MM-DD, or with spaces/dashes
- Dates from any year are valid — there is no date range restriction

## WHAT TO EXTRACT
Only extract activities that have AT LEAST ONE actual date (a date marked with "A"). Skip activities that only have planned dates and no actual dates.

## RAW TEXT TO ANALYZE
${textChunk}

## OUTPUT FORMAT
Return a JSON array of objects. If no activities with actual dates are found in this chunk, return an empty array [].
Fields:
- activityId: string (required) — the exact activity ID as it appears
- activityDescription: string (required) — the activity description/name
- wbs: string or null
- actualStartDate: ISO date string or null (only dates marked with "A")
- actualFinishDate: ISO date string or null (only dates marked with "A")
- plannedStartDate: ISO date string or null (dates without "A" marker)
- plannedFinishDate: ISO date string or null (dates without "A" marker)
- isCriticalPath: "yes", "no", or "unknown"
- totalFloat: number or null (in days, can be negative)

Return ONLY the JSON array, no other text.`;

    const modelId = new ModelId('gpt-5.4');

    const response = await this.aiClient.chat({
      model: modelId,
      messages: [AIMessage.user(prompt)],
    });

    if (tokenUsageCallback && runId) {
      await tokenUsageCallback({
        operation: chunkNumber !== undefined
          ? `schedule_parsing_chunk_${chunkNumber}`
          : 'schedule_parsing',
        model: modelId.getValue(),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        runId,
      });
    }

    const responseText = response.content;

    console.log(`[PdfScheduleParser] Chunk ${chunkNumber}: Sent ${textChunk.length} chars to AI`);

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      if (responseText.trim() === '[]' || responseText.includes('no activities') || responseText.includes('No activities')) {
        console.log(`[PdfScheduleParser] Chunk ${chunkNumber}: No activities found in this chunk`);
        return [];
      }
      console.error(`[PdfScheduleParser] Chunk ${chunkNumber}: AI response did not contain valid JSON array`);
      console.error(`[PdfScheduleParser] Chunk ${chunkNumber}: AI response was:`, responseText.substring(0, 500));
      throw new Error('AI response did not contain valid JSON array');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      activityId: string;
      activityDescription: string;
      wbs?: string | null;
      actualStartDate?: string | null;
      actualFinishDate?: string | null;
      plannedStartDate?: string | null;
      plannedFinishDate?: string | null;
      isCriticalPath?: string;
      totalFloat?: number | null;
    }>;

    console.log(`[PdfScheduleParser] Chunk ${chunkNumber}: AI returned ${parsed.length} activities`);
    if (parsed.length > 0) {
      console.log(`[PdfScheduleParser] Chunk ${chunkNumber}: First activity:`, parsed[0]);
    }

    return parsed.map(item => ({
      activityId: item.activityId,
      activityDescription: item.activityDescription,
      wbs: item.wbs || null,
      actualStartDate: item.actualStartDate ? new Date(item.actualStartDate) : null,
      actualFinishDate: item.actualFinishDate ? new Date(item.actualFinishDate) : null,
      plannedStartDate: item.plannedStartDate ? new Date(item.plannedStartDate) : null,
      plannedFinishDate: item.plannedFinishDate ? new Date(item.plannedFinishDate) : null,
      isCriticalPath: item.isCriticalPath || 'unknown',
      totalFloat: this.parseNumber(item.totalFloat),
    }));
  }

  private parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private extractAllActivitiesSection(fullText: string): string {
    const sectionDividerPattern = /ALL\s*ACTIVITIES(?!\s*\n\s*Layout:)/gi;
    let sectionDividerIndex = -1;
    let match: RegExpExecArray | null;
    
    while ((match = sectionDividerPattern.exec(fullText)) !== null) {
      const textAfterMatch = fullText.substring(match.index, match.index + 100);
      if (!textAfterMatch.includes('Layout:') && !textAfterMatch.includes('filter:')) {
        sectionDividerIndex = match.index;
        console.log(`[PdfScheduleParser] Found section divider "ALL ACTIVITIES" at index ${match.index}`);
        break;
      }
    }
    
    if (sectionDividerIndex !== -1) {
      const extracted = fullText.substring(sectionDividerIndex);
      console.log(`[PdfScheduleParser] Extracted section length: ${extracted.length} chars (from ${fullText.length} total)`);
      console.log(`[PdfScheduleParser] First 500 chars of extracted section:\n${extracted.substring(0, 500)}`);
      return extracted;
    }
    
    console.log(`[PdfScheduleParser] Section divider not found, processing full text (${fullText.length} chars)`);
    return fullText;
  }
}
