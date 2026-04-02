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
        message: `Identifying activity lines from PDF...`,
        percentage: 15,
      });

      const textToProcess = this.extractAllActivitiesSection(fullText);
      const filteredLines = this.filterActivityLines(textToProcess);
      
      console.log(`[PdfScheduleParser] Found ${filteredLines.length} activity lines`);

      if (filteredLines.length === 0) {
        progress.report({
          stage: 'complete',
          message: 'No activity lines found in PDF',
          percentage: 100,
        });
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: [`No activity lines found in PDF. The document may not contain recognizable CPM schedule activity data.`],
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }
      
      console.log(`[PdfScheduleParser] Sending ${filteredLines.length} activity lines to AI for extraction`);

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
        scheduleUpdateMonth: null,
        errors,
        totalRowsProcessed: filteredLines.length,
        successfulRows: rows.length,
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

  private filterActivityLines(text: string): string[] {
    const lines = text.split('\n');
    const filteredLines: string[] = [];

    const activityIdPatterns = [
      /\d+-[A-Za-z]+-\d+/,
      /\d+-[A-Za-z]{1,4}-\d+/,
      /[A-Za-z]+-\d+/,
      /[A-Za-z]{1,6}\d{3,}/,
      /\d+-[A-Za-z]+-\d+[A-Za-z]/,
      /[A-Za-z]{2,6}-\d{2,6}-\d+/,
    ];

    const dateOnlyPattern = /^\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}$/;
    const monthAbbreviations = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;
    const monthYearPattern = /^[A-Za-z]{3,9}[-\/\s]\d{2,4}$/;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 10) continue;

      let hasActivityId = false;
      for (const pattern of activityIdPatterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          if (dateOnlyPattern.test(match[0])) continue;
          if (monthYearPattern.test(match[0])) continue;
          const parts = match[0].split(/[-_]/);
          const allMonth = parts.every(p => monthAbbreviations.test(p) || /^\d{1,4}$/.test(p));
          if (allMonth && parts.length <= 3) continue;
          hasActivityId = true;
          break;
        }
      }

      if (hasActivityId) {
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
    const prompt = `You are parsing CPM (Critical Path Method) schedule data extracted from a PDF. Extract structured activity data from the lines below.

## ACTIVITY ID RECOGNITION
Activity IDs can appear in many formats. Do NOT restrict to any single pattern. Common formats include but are not limited to:
- Numeric-alpha-numeric: "1-W-0036", "4-PF-1526", "3-WE-1111"
- Alpha-numeric: "PROC-0005", "DSC-023", "DSC-024"
- Alpha with number suffix: "FM0009", "FM0012"
- With letter suffixes: "4-PH-1460A"
- Any other alphanumeric code that serves as a unique activity identifier

The Activity ID is typically the FIRST column in the schedule data. Use column headers (if visible in the text) to identify which values are Activity IDs, descriptions, dates, etc. Note that column headers may appear duplicated in the PDF text.

## DATE EXTRACTION
- Dates followed by "A" are ACTUAL dates (e.g., "29-Jul-25 A" means actual date July 29, 2025)
- Dates may be in formats: DD-Mon-YY, DD/MM/YY, Mon-DD-YY, MM/DD/YY, YYYY-MM-DD, or with spaces instead of dashes
- Extract ALL activities that have at least one actual date (Actual Start or Actual Finish)
- If an activity has no actual dates at all, skip it

## OTHER FIELDS TO EXTRACT
- Activity Name/Description: descriptive text about the work (usually the second column)
- WBS: hierarchical numbers or zone indicators (may be null)
- TF (Total Float): numeric value in days, can be negative (may be null)
- LP/CP (Critical Path): look for checkbox markers, asterisks, TF=0, or explicit critical path indicators

## LINES TO PARSE
${lines.join('\n')}

## OUTPUT FORMAT
Return a JSON array of objects. Only include activities with at least one actual date.
Fields:
- activityId: string (required) — the exact activity ID as it appears in the schedule
- activityDescription: string (required)
- wbs: string or null
- actualStartDate: ISO date string or null (only dates marked with "A")
- actualFinishDate: ISO date string or null (only dates marked with "A")
- plannedStartDate: ISO date string or null
- plannedFinishDate: ISO date string or null
- isCriticalPath: "yes", "no", or "unknown"
- totalFloat: number or null

Return ONLY the JSON array, no other text.`;

    const modelId = new ModelId('gpt-5.4');
    
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

    console.log(`[PdfScheduleParser] Batch ${batchNumber}: AI returned ${parsed.length} activities`);
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
