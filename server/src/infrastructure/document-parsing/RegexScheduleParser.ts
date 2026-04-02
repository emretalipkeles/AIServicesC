import { PDFParse } from 'pdf-parse';
import type { ParsedScheduleRow } from '../../domain/delay-analysis/interfaces/IExcelParser';
import type { 
  IScheduleParser, 
  ScheduleParseOptions, 
  ScheduleParseResult 
} from '../../domain/delay-analysis/interfaces/IScheduleParser';
import { NoOpProgressReporter } from '../../domain/delay-analysis/interfaces/IProgressReporter';

interface ExtractedActivity {
  activityId: string;
  description: string;
  wbs: string | null;
  plannedStart: Date | null;
  plannedFinish: Date | null;
  actualStart: Date | null;
  actualFinish: Date | null;
  isCriticalPath: string;
  totalFloat: number | null;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export class RegexScheduleParser implements IScheduleParser {
  private readonly supportedContentTypes = ['application/pdf'];
  private readonly supportedExtensions = ['.pdf'];

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
        stage: 'parsing_pdf',
        message: 'Identifying activities with actual dates...',
        percentage: 20,
      });

      const textToProcess = this.extractAllActivitiesSection(fullText);
      const activityLines = this.extractActivityLines(textToProcess);
      
      console.log(`[RegexScheduleParser] Found ${activityLines.length} activity lines in PDF`);

      if (activityLines.length === 0) {
        progress.report({
          stage: 'complete',
          message: 'No activity lines found in PDF',
          percentage: 100,
        });
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: [`No activity lines found in PDF. Expected activity IDs like "1-W-0036" or "3-PF-1526".`],
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }

      progress.report({
        stage: 'filtering_dates',
        message: `Parsing ${activityLines.length} activity lines...`,
        percentage: 40,
      });

      let activitiesWithActualDates = 0;
      let linesWithAMarkerButNoId = 0;
      const missedSamples: string[] = [];
      
      for (const line of activityLines) {
        const parsed = this.parseActivityLine(line);
        if (parsed && (parsed.actualStart || parsed.actualFinish)) {
          rows.push({
            activityId: parsed.activityId,
            activityDescription: parsed.description,
            wbs: parsed.wbs,
            plannedStartDate: parsed.plannedStart,
            plannedFinishDate: parsed.plannedFinish,
            actualStartDate: parsed.actualStart,
            actualFinishDate: parsed.actualFinish,
            isCriticalPath: parsed.isCriticalPath,
            totalFloat: parsed.totalFloat,
          });
          activitiesWithActualDates++;
        } else if (!parsed && /\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}\s*A\b/i.test(line)) {
          linesWithAMarkerButNoId++;
          if (missedSamples.length < 5) {
            missedSamples.push(line.substring(0, 150));
          }
        }
      }

      console.log(`[RegexScheduleParser] Extracted ${activitiesWithActualDates} activities with actual dates`);
      if (linesWithAMarkerButNoId > 0) {
        console.log(`[RegexScheduleParser] WARNING: ${linesWithAMarkerButNoId} lines had 'A' date markers but no detected activity ID`);
        console.log(`[RegexScheduleParser] Missed samples:`, missedSamples);
      }

      if (rows.length > 0) {
        console.log(`[RegexScheduleParser] Sample activity:`, rows[0]);
      }

      progress.report({
        stage: 'complete',
        message: `Successfully extracted ${rows.length} activities with actual dates`,
        percentage: 100,
      });

      return {
        rows,
        scheduleUpdateMonth: null,
        errors,
        totalRowsProcessed: activityLines.length,
        successfulRows: rows.length,
      };
    } catch (error) {
      console.error('[RegexScheduleParser] Error parsing PDF:', error);
      return {
        rows: [],
        scheduleUpdateMonth: null,
        errors: [`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRowsProcessed: 0,
        successfulRows: 0,
      };
    }
  }

  private extractAllActivitiesSection(fullText: string): string {
    const sectionDividerPattern = /ALL\s*ACTIVITIES(?!\s*\n\s*Layout:)/gi;
    let sectionDividerIndex = -1;
    let match: RegExpExecArray | null;
    
    while ((match = sectionDividerPattern.exec(fullText)) !== null) {
      const textAfterMatch = fullText.substring(match.index, match.index + 100);
      if (!textAfterMatch.includes('Layout:') && !textAfterMatch.includes('filter:')) {
        sectionDividerIndex = match.index;
        console.log(`[RegexScheduleParser] Found section divider "ALL ACTIVITIES" at index ${match.index}`);
        break;
      }
    }
    
    if (sectionDividerIndex !== -1) {
      const extracted = fullText.substring(sectionDividerIndex);
      console.log(`[RegexScheduleParser] Extracted section length: ${extracted.length} chars (from ${fullText.length} total)`);
      return extracted;
    }
    
    console.log(`[RegexScheduleParser] Section divider not found, processing full text (${fullText.length} chars)`);
    return fullText;
  }

  private extractActivityLines(text: string): string[] {
    const lines = text.split('\n');
    const activityLines: string[] = [];
    
    // Full date pattern to exclude (DD-Mon-YY, DD/Mon/YY, DD Mon YY)
    const datePattern = /^\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}$/;
    // Month abbreviations to exclude from activity ID matching
    const monthAbbreviations = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;
    
    const activityIdPatterns = [
      /(\d+)-([A-Za-z]+)-(\d+)/,
      /(\d+)-([A-Za-z]{1,4})-(\d+)/,
      /([A-Za-z]+)-(\d+)-(\d+)/,
      /([A-Za-z]{1,4})(\d+)-(\d+)/,
      /(\d+)([A-Za-z]{1,4})(\d+)/,
    ];
    
    const hasActivityId = (line: string): boolean => {
      for (const pattern of activityIdPatterns) {
        const match = line.match(pattern);
        if (match) {
          // Check if the full match looks like a date (e.g., 11-Sep-24)
          if (datePattern.test(match[0])) {
            continue;
          }
          // Check if any captured group is a month abbreviation (date string)
          const groups = match.slice(1);
          const hasMonthAbbr = groups.some(g => monthAbbreviations.test(g));
          if (!hasMonthAbbr) {
            return true;
          }
        }
      }
      return false;
    };
    
    let currentActivityLine = '';
    let currentHasActivityId = false;
    let pendingLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        if (currentActivityLine && currentHasActivityId) {
          activityLines.push(currentActivityLine.trim());
          currentActivityLine = '';
          currentHasActivityId = false;
        }
        pendingLines = [];
        continue;
      }
      
      const lineHasId = hasActivityId(trimmedLine);
      
      if (lineHasId) {
        if (currentActivityLine && currentHasActivityId) {
          activityLines.push(currentActivityLine.trim());
        }
        
        if (pendingLines.length > 0) {
          currentActivityLine = pendingLines.join(' ') + ' ' + trimmedLine;
          pendingLines = [];
        } else {
          currentActivityLine = trimmedLine;
        }
        currentHasActivityId = true;
      } else if (currentHasActivityId) {
        currentActivityLine += ' ' + trimmedLine;
      } else {
        pendingLines.push(trimmedLine);
        if (pendingLines.length > 3) {
          pendingLines.shift();
        }
      }
    }

    if (currentActivityLine && currentHasActivityId) {
      activityLines.push(currentActivityLine.trim());
    }

    return activityLines;
  }

  private parseActivityLine(line: string): ExtractedActivity | null {
    // Full date pattern to exclude (DD-Mon-YY, DD/Mon/YY, DD Mon YY)
    const datePattern = /^\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}$/;
    // Month abbreviations to exclude from activity ID matching
    const monthAbbreviations = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i;
    
    const idPatterns = [
      /(\d+)-([A-Za-z]+)-(\d+)/,
      /(\d+)-([A-Za-z]{1,4})-(\d+)/,
      /([A-Za-z]+)-(\d+)-(\d+)/,
      /([A-Za-z]{1,4})(\d+)-(\d+)/,
      /(\d+)([A-Za-z]{1,4})(\d+)/,
    ];
    
    let activityId: string | null = null;
    for (const pattern of idPatterns) {
      const match = line.match(pattern);
      if (match) {
        // Check if the full match looks like a date (e.g., 11-Sep-24)
        if (datePattern.test(match[0])) {
          continue;
        }
        // Check if any captured group is a month abbreviation (date string)
        const groups = match.slice(1);
        const hasMonthAbbr = groups.some(g => monthAbbreviations.test(g));
        if (!hasMonthAbbr) {
          activityId = match[0];
          break;
        }
      }
    }
    
    if (!activityId) {
      return null;
    }
    
    const dateWithAPattern = /(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{2,4})\s*A\b/gi;
    const actualDates: Date[] = [];
    let dateMatch: RegExpExecArray | null;
    
    while ((dateMatch = dateWithAPattern.exec(line)) !== null) {
      const date = this.parseDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (date) {
        actualDates.push(date);
      }
    }

    if (actualDates.length === 0) {
      const altDatePattern = /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\s*A\b/gi;
      while ((dateMatch = altDatePattern.exec(line)) !== null) {
        const month = parseInt(dateMatch[1], 10);
        const day = parseInt(dateMatch[2], 10);
        let year = parseInt(dateMatch[3], 10);
        if (year < 100) year += 2000;
        
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime())) {
            actualDates.push(date);
          }
        }
      }
    }

    if (actualDates.length === 0) {
      return null;
    }

    actualDates.sort((a, b) => a.getTime() - b.getTime());
    const actualStart = actualDates[0];
    const actualFinish = actualDates.length > 1 ? actualDates[actualDates.length - 1] : null;

    const plannedDates = this.extractPlannedDates(line);

    const description = this.extractDescription(line, activityId);
    const wbs = this.extractWbs(line);
    const totalFloat = this.extractTotalFloat(line);
    const isCriticalPath = this.extractCriticalPath(line, totalFloat);

    return {
      activityId,
      description,
      wbs,
      plannedStart: plannedDates.start,
      plannedFinish: plannedDates.finish,
      actualStart,
      actualFinish,
      isCriticalPath,
      totalFloat,
    };
  }

  private parseDate(dayStr: string, monthStr: string, yearStr: string): Date | null {
    const day = parseInt(dayStr, 10);
    const monthLower = monthStr.toLowerCase();
    const month = MONTH_MAP[monthLower];
    
    if (month === undefined) return null;
    
    let year = parseInt(yearStr, 10);
    if (year < 100) year += 2000;
    
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  }

  private extractPlannedDates(line: string): { start: Date | null; finish: Date | null } {
    const datePattern = /(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{2,4})(?!\s*A\b)/gi;
    const plannedDates: Date[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = datePattern.exec(line)) !== null) {
      const date = this.parseDate(match[1], match[2], match[3]);
      if (date) {
        plannedDates.push(date);
      }
    }

    if (plannedDates.length === 0) {
      return { start: null, finish: null };
    }

    plannedDates.sort((a, b) => a.getTime() - b.getTime());
    return {
      start: plannedDates[0],
      finish: plannedDates.length > 1 ? plannedDates[plannedDates.length - 1] : null,
    };
  }

  private extractDescription(line: string, activityId: string): string {
    const idIndex = line.indexOf(activityId);
    if (idIndex === -1) {
      return 'Unknown Activity';
    }

    const afterId = line.substring(idIndex + activityId.length).trim();
    
    const datePattern = /\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}/;
    const dateMatch = afterId.match(datePattern);
    
    let desc = '';
    if (dateMatch && dateMatch.index !== undefined) {
      desc = afterId.substring(0, dateMatch.index).trim();
    } else {
      // No date found, use the afterId cleaned up
      desc = afterId
        .replace(/\d{1,2}[-\/\s][A-Za-z]{3}[-\/\s]\d{2,4}/g, '')
        .replace(/\s+A\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // Remove trailing numeric columns (duration, float, etc.)
    // Pattern: strip sequences of numbers at the end like "12 12 0 12 0 12" or "-3 12.5 0"
    desc = desc.replace(/(\s+-?\d+(?:\.\d+)?)+\s*$/, '').trim();
    
    // Also remove leading dash/hyphen if present
    desc = desc.replace(/^\s*[-–—]\s*/, '').trim();
    
    if (desc.length > 3) {
      return desc.substring(0, 200);
    }

    return desc || 'Unknown Activity';
  }

  private extractWbs(line: string): string | null {
    const wbsPatterns = [
      /\bWBS[:\s]*([A-Z0-9.\-]+)/i,
      /\b(\d{2}\.\d{2}\.\d{2}(?:\.\d{2})?)\b/,
      /\b([A-Z]\d{2}\.\d{2}(?:\.\d{2})?)\b/,
    ];

    for (const pattern of wbsPatterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private extractTotalFloat(line: string): number | null {
    const tfPatterns = [
      /\bTF[:\s]*(-?\d+)/i,
      /\bTotal\s*Float[:\s]*(-?\d+)/i,
      /\bFloat[:\s]*(-?\d+)/i,
    ];

    for (const pattern of tfPatterns) {
      const match = line.match(pattern);
      if (match) {
        const value = parseInt(match[1], 10);
        return isNaN(value) ? null : value;
      }
    }

    const numberAtEnd = line.match(/\s(-?\d+)\s*$/);
    if (numberAtEnd) {
      const value = parseInt(numberAtEnd[1], 10);
      if (!isNaN(value) && value >= -1000 && value <= 1000) {
        return value;
      }
    }

    return null;
  }

  private extractCriticalPath(line: string, totalFloat: number | null): string {
    if (totalFloat === 0) {
      return 'yes';
    }

    const lpPatterns = [
      /\bLP[:\s]*([YyNn]|yes|no|true|false)/i,
      /\bCritical[:\s]*([YyNn]|yes|no|true|false)/i,
      /\bCP[:\s]*([YyNn]|yes|no|true|false)/i,
    ];

    for (const pattern of lpPatterns) {
      const match = line.match(pattern);
      if (match) {
        const value = match[1].toLowerCase();
        if (value === 'y' || value === 'yes' || value === 'true') {
          return 'yes';
        }
        if (value === 'n' || value === 'no' || value === 'false') {
          return 'no';
        }
      }
    }

    if (/\[x\]|\[✓\]|\[✔\]|☑/.test(line)) {
      return 'yes';
    }

    if (/\[\s*\]|☐/.test(line)) {
      return 'no';
    }

    return 'unknown';
  }
}
