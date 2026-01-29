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
        message: `Identifying activity lines from PDF...`,
        percentage: 15,
      });

      const textToProcess = this.extractAllActivitiesSection(fullText);
      const filteredLines = this.filterActivityLines(textToProcess);
      
      console.log(`[PdfScheduleParser] Found ${filteredLines.length} activity lines to send to AI for ${options.targetMonth}/${options.targetYear} filtering`);

      if (filteredLines.length === 0) {
        progress.report({
          stage: 'complete',
          message: 'No activity lines found in PDF',
          percentage: 100,
        });
        return {
          rows: [],
          scheduleUpdateMonth: `${options.targetYear}-${String(options.targetMonth).padStart(2, '0')}`,
          errors: [`No activity lines found in PDF. Expected activity IDs like "1-W-0036" or "3-PF-1526".`],
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

  private filterActivityLines(text: string): string[] {
    const lines = text.split('\n');
    const filteredLines: string[] = [];
    
    const activityIdPattern = /\d+-[A-Za-z]+-\d+|\d+-[A-Za-z]{1,3}-\d+/;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 15) continue;
      
      if (activityIdPattern.test(trimmedLine)) {
        filteredLines.push(trimmedLine);
      }
    }

    return filteredLines;
  }

  private async parseWithAI(
    lines: string[], 
    options: ScheduleParseOptions,
    tokenUsageCallback?: TokenUsageCallback,
    runId?: string,
    batchNumber?: number
  ): Promise<ParsedScheduleRow[]> {
    const monthName = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'][options.targetMonth];
    
    const prompt = `You are parsing CPM schedule data from a PDF. Extract structured activity data from these lines.

CRITICAL FILTERING RULE:
Only include activities where EITHER the Actual Start Date OR the Actual Finish Date falls in ${monthName} ${options.targetYear}.
- Dates followed by "A" are ACTUAL dates (e.g., "29-Jul-25 A" means actual date July 29, 2025)
- Dates may be in formats: DD-Mon-YY, DD/MM/YY, Mon-DD-YY, or with spaces instead of dashes
- If an activity has no actual dates in ${monthName} ${options.targetYear}, do NOT include it

Activity ID formats: "1-W-0036", "4-PF-1526", "3-WE-1111", "3-W-1100"

Other fields to extract:
- Activity Name/Description: descriptive text about the work
- WBS: hierarchical numbers or zone indicators (may be null)
- TF (Total Float): numeric value in days, can be negative (may be null)
- LP (Critical Path): look for checkbox markers, asterisks, or TF=0

Lines to parse:
${lines.join('\n')}

Return a JSON array of objects. Only include activities with actual dates in ${monthName} ${options.targetYear}.
Fields:
- activityId: string (required)
- activityDescription: string (required)
- wbs: string or null
- actualStartDate: ISO date string or null (only dates marked with "A")
- actualFinishDate: ISO date string or null (only dates marked with "A")
- plannedStartDate: ISO date string or null
- plannedFinishDate: ISO date string or null
- isCriticalPath: "yes", "no", or "unknown"
- totalFloat: number or null

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
    
    console.log(`[PdfScheduleParser] Batch ${batchNumber}: Sent ${lines.length} lines to AI`);
    console.log(`[PdfScheduleParser] Batch ${batchNumber}: First 3 lines sample:`, lines.slice(0, 3));
    
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error(`[PdfScheduleParser] Batch ${batchNumber}: AI response did not contain valid JSON array`);
      console.error(`[PdfScheduleParser] Batch ${batchNumber}: AI response was:`, responseText.substring(0, 500));
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

    console.log(`[PdfScheduleParser] Batch ${batchNumber}: AI returned ${parsed.length} activities for ${monthName} ${options.targetYear}`);
    if (parsed.length > 0) {
      console.log(`[PdfScheduleParser] Batch ${batchNumber}: First activity:`, parsed[0]);
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
