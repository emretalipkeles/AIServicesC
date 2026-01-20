import * as XLSX from 'xlsx';
import type { IExcelParser, ExcelParseResult, ParsedScheduleRow } from '../../domain/delay-analysis/interfaces/IExcelParser';

interface ColumnMapping {
  activityId: string[];
  wbs: string[];
  description: string[];
  plannedStart: string[];
  plannedFinish: string[];
  actualStart: string[];
  actualFinish: string[];
  criticalPath: string[];
}

const COLUMN_MAPPINGS: ColumnMapping = {
  activityId: ['activity id', 'activityid', 'activity_id', 'act id', 'actid', 'task id', 'id'],
  wbs: ['wbs', 'wbs code', 'wbs_code', 'work breakdown structure'],
  description: ['activity description', 'description', 'activity name', 'task name', 'name', 'activity_description'],
  plannedStart: ['planned start', 'planned_start', 'start date', 'early start', 'bl start', 'baseline start'],
  plannedFinish: ['planned finish', 'planned_finish', 'finish date', 'early finish', 'bl finish', 'baseline finish'],
  actualStart: ['actual start', 'actual_start', 'as', 'start'],
  actualFinish: ['actual finish', 'actual_finish', 'af', 'finish'],
  criticalPath: ['critical', 'critical path', 'is critical', 'cp', 'crit'],
};

export class ExcelScheduleParser implements IExcelParser {
  private readonly supportedContentTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  canParse(contentType: string): boolean {
    return this.supportedContentTypes.includes(contentType);
  }

  async parseSchedule(buffer: Buffer, filename: string): Promise<ExcelParseResult> {
    const errors: string[] = [];
    const rows: ParsedScheduleRow[] = [];
    let totalRowsProcessed = 0;

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      
      if (workbook.SheetNames.length === 0) {
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: ['No sheets found in Excel file'],
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

      if (jsonData.length === 0) {
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: ['No data rows found in Excel file'],
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }

      const columnMap = this.detectColumns(Object.keys(jsonData[0] || {}));

      if (!columnMap.activityId) {
        errors.push('Could not find Activity ID column');
      }
      if (!columnMap.description) {
        errors.push('Could not find Activity Description column');
      }

      if (!columnMap.activityId || !columnMap.description) {
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors,
          totalRowsProcessed: 0,
          successfulRows: 0,
        };
      }

      for (let i = 0; i < jsonData.length; i++) {
        totalRowsProcessed++;
        const row = jsonData[i];

        try {
          const activityId = this.getString(row[columnMap.activityId]);
          const description = this.getString(row[columnMap.description]);

          if (!activityId || !description) {
            continue;
          }

          const parsedRow: ParsedScheduleRow = {
            activityId,
            wbs: columnMap.wbs ? this.getString(row[columnMap.wbs]) : null,
            activityDescription: description,
            plannedStartDate: columnMap.plannedStart ? this.parseDate(row[columnMap.plannedStart]) : null,
            plannedFinishDate: columnMap.plannedFinish ? this.parseDate(row[columnMap.plannedFinish]) : null,
            actualStartDate: columnMap.actualStart ? this.parseDate(row[columnMap.actualStart]) : null,
            actualFinishDate: columnMap.actualFinish ? this.parseDate(row[columnMap.actualFinish]) : null,
            isCriticalPath: columnMap.criticalPath ? this.parseCriticalPath(row[columnMap.criticalPath]) : 'unknown',
          };

          rows.push(parsedRow);
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError instanceof Error ? rowError.message : 'Parse error'}`);
        }
      }

      const scheduleUpdateMonth = this.extractScheduleMonth(filename);

      return {
        rows,
        scheduleUpdateMonth,
        errors,
        totalRowsProcessed,
        successfulRows: rows.length,
      };
    } catch (error) {
      return {
        rows: [],
        scheduleUpdateMonth: null,
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRowsProcessed: 0,
        successfulRows: 0,
      };
    }
  }

  private detectColumns(headers: string[]): Record<string, string | null> {
    const result: Record<string, string | null> = {
      activityId: null,
      wbs: null,
      description: null,
      plannedStart: null,
      plannedFinish: null,
      actualStart: null,
      actualFinish: null,
      criticalPath: null,
    };

    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().trim();

      for (const [field, patterns] of Object.entries(COLUMN_MAPPINGS)) {
        if (result[field] === null) {
          for (const pattern of patterns) {
            if (normalizedHeader === pattern || normalizedHeader.includes(pattern)) {
              result[field] = header;
              break;
            }
          }
        }
      }
    }

    return result;
  }

  private getString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
  }

  private parseDate(value: unknown): Date | null {
    if (value === null || value === undefined) return null;

    if (value instanceof Date) {
      return isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string') {
      const dateStr = value.trim();
      if (dateStr.length === 0) return null;
      
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private parseCriticalPath(value: unknown): string {
    if (value === null || value === undefined) return 'unknown';
    
    const str = String(value).toLowerCase().trim();
    
    if (['yes', 'y', 'true', '1', 'x', 'critical'].includes(str)) {
      return 'yes';
    }
    if (['no', 'n', 'false', '0', '', 'non-critical'].includes(str)) {
      return 'no';
    }
    
    return 'unknown';
  }

  private extractScheduleMonth(filename: string): string | null {
    const monthPatterns = [
      /(\d{4})[_-](\d{2})/,
      /(\d{2})[_-](\d{4})/,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[_\s-]*(\d{4})/i,
      /(\d{4})[_\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
    ];

    for (const pattern of monthPatterns) {
      const match = filename.match(pattern);
      if (match) {
        return match[0];
      }
    }

    return null;
  }
}
