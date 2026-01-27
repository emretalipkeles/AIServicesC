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

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

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
        message: `Filtering for activities with actual dates in ${options.targetMonth}/${options.targetYear}...`,
        percentage: 15,
      });

      const textToProcess = this.extractAllActivitiesSection(fullText);
      const filteredLines = this.filterActualDateLines(textToProcess, options);
      
      console.log(`[PdfScheduleParser] Filtered ${filteredLines.length} lines with actual dates for ${options.targetMonth}/${options.targetYear}`);

      if (filteredLines.length === 0) {
        progress.report({
          stage: 'complete',
          message: 'No activities with actual dates found for selected month',
          percentage: 100,
        });
        return {
          rows: [],
          scheduleUpdateMonth: `${options.targetYear}-${String(options.targetMonth).padStart(2, '0')}`,
          errors: [`No activities with actual dates found for ${options.targetMonth}/${options.targetYear}`],
          totalRowsProcessed: 0,
          successfulRows: 0,
          filteredByMonth: 0,
        };
      }

      progress.report({
        stage: 'ai_processing',
        message: `Found ${filteredLines.length} potential activities. Starting AI analysis...`,
        percentage: 20,
        details: { total: filteredLines.length },
      });

      const batchSize = 30;
      const batches = this.chunkArray(filteredLines, batchSize);

      for (let i = 0; i < batches.length; i++) {
        const batchProgress = 20 + ((i + 1) / batches.length) * 60;
        progress.report({
          stage: 'processing_batch',
          message: `Processing batch ${i + 1} of ${batches.length}...`,
          percentage: Math.round(batchProgress),
          details: {
            batchNumber: i + 1,
            totalBatches: batches.length,
            current: rows.length,
            total: filteredLines.length,
          },
        });

        try {
          const batchRows = await this.parseWithAI(
            batches[i], 
            options,
            options.tokenUsageCallback,
            options.runId,
            i + 1
          );
          rows.push(...batchRows);
        } catch (batchError) {
          errors.push(`Batch ${i + 1}: ${batchError instanceof Error ? batchError.message : 'Parse error'}`);
        }
      }

      return {
        rows,
        scheduleUpdateMonth: `${options.targetYear}-${String(options.targetMonth).padStart(2, '0')}`,
        errors,
        totalRowsProcessed: filteredLines.length,
        successfulRows: rows.length,
        filteredByMonth: filteredLines.length,
      };
    } catch (error) {
      return {
        rows: [],
        scheduleUpdateMonth: null,
        errors: [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRowsProcessed: 0,
        successfulRows: 0,
        filteredByMonth: 0,
      };
    }
  }

  private filterActualDateLines(text: string, options: ScheduleParseOptions): string[] {
    const lines = text.split('\n');
    const filteredLines: string[] = [];
    
    const targetMonthName = Object.entries(MONTH_NAMES)
      .find(([_, num]) => num === options.targetMonth)?.[0] || '';
    
    const yearStr = String(options.targetYear).slice(-2);
    const yearPattern = new RegExp(`(${targetMonthName}|${String(options.targetMonth).padStart(2, '0')})[^\\d]*${yearStr}\\s*A`, 'i');
    const dateWithAPattern = /\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4}\s*A|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*A/;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 10) continue;
      
      if (dateWithAPattern.test(trimmedLine)) {
        if (yearPattern.test(trimmedLine) || this.lineContainsTargetMonth(trimmedLine, options)) {
          filteredLines.push(trimmedLine);
        }
      }
    }

    return filteredLines;
  }

  private lineContainsTargetMonth(line: string, options: ScheduleParseOptions): boolean {
    const datePatterns = [
      /(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})\s*A/g,
      /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\s*A/g,
    ];

    for (const pattern of datePatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        let month: number | null = null;
        let year: number | null = null;

        if (isNaN(parseInt(match[2]))) {
          month = MONTH_NAMES[match[2].toLowerCase().slice(0, 3)] || null;
        } else {
          month = parseInt(match[2]);
        }

        const yearMatch = parseInt(match[3]);
        year = yearMatch < 100 ? 2000 + yearMatch : yearMatch;

        if (month === options.targetMonth && year === options.targetYear) {
          return true;
        }
      }
    }

    return false;
  }

  private async parseWithAI(
    lines: string[], 
    options: ScheduleParseOptions,
    tokenUsageCallback?: TokenUsageCallback,
    runId?: string,
    batchNumber?: number
  ): Promise<ParsedScheduleRow[]> {
    const prompt = `You are parsing CPM schedule data from a PDF. Extract structured activity data from these lines.

Target month/year: ${options.targetMonth}/${options.targetYear}

Rules:
- Activity ID is usually alphanumeric like "1-W-0036", "4-PF-1526", "3-WE-1111"
- Dates with "A" suffix are ACTUAL dates (e.g., "04-Mar-25 A")
- Look for Activity Name/Description which is descriptive text
- WBS is usually hierarchical numbers or zone indicators
- Original Duration (OD), Actual Duration (AD), Remaining Duration (RD) may be present
- TF or Total Float is a numeric value representing float days (positive or negative integer)
- LP indicates if activity is on critical path (checkbox or asterisk marker)
- Only include activities where the actual date falls in ${options.targetMonth}/${options.targetYear}

Lines to parse:
${lines.join('\n')}

Return a JSON array of objects with these fields:
- activityId: string (required)
- activityDescription: string (required)
- wbs: string or null
- actualStartDate: ISO date string or null (for dates with "A")
- actualFinishDate: ISO date string or null (for dates with "A")
- plannedStartDate: ISO date string or null
- plannedFinishDate: ISO date string or null
- isCriticalPath: "yes", "no", or "unknown" (look for LP column, asterisk markers, or TF=0)
- totalFloat: number or null (TF column value in days, can be negative)

Return ONLY the JSON array, no other text.`;

    const modelId = new ModelId('gpt-5.2');
    
    const response = await this.aiClient.chat({
      model: modelId,
      messages: [AIMessage.user(prompt)],
    });

    if (tokenUsageCallback && runId) {
      await tokenUsageCallback({
        operation: batchNumber !== undefined 
          ? `schedule_parsing_batch_${batchNumber}` 
          : 'schedule_parsing',
        model: modelId.getValue(),
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        runId,
      });
    }

    const responseText = response.content;
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
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

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
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
