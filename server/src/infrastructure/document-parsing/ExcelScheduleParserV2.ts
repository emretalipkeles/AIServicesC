import * as XLSX from 'xlsx';
import type { ParsedScheduleRow } from '../../domain/delay-analysis/interfaces/IExcelParser';
import type { 
  IScheduleParser, 
  ScheduleParseOptions, 
  ScheduleParseResult 
} from '../../domain/delay-analysis/interfaces/IScheduleParser';

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

export class ExcelScheduleParserV2 implements IScheduleParser {
  private readonly supportedContentTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  private readonly supportedExtensions = ['.xlsx', '.xls'];

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
    let totalRowsProcessed = 0;
    let filteredByMonth = 0;

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      
      if (workbook.SheetNames.length === 0) {
        return {
          rows: [],
          scheduleUpdateMonth: null,
          errors: ['No sheets found in Excel file'],
          totalRowsProcessed: 0,
          successfulRows: 0,
          filteredByMonth: 0,
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
          filteredByMonth: 0,
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
          filteredByMonth: 0,
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

          const actualStartDate = columnMap.actualStart ? this.parseDate(row[columnMap.actualStart]) : null;
          const actualFinishDate = columnMap.actualFinish ? this.parseDate(row[columnMap.actualFinish]) : null;

          if (options.filterActualOnly && !actualStartDate && !actualFinishDate) {
            continue;
          }

          if (!this.isInTargetMonth(actualStartDate, actualFinishDate, options)) {
            continue;
          }

          filteredByMonth++;

          const parsedRow: ParsedScheduleRow = {
            activityId,
            wbs: columnMap.wbs ? this.getString(row[columnMap.wbs]) : null,
            activityDescription: description,
            plannedStartDate: columnMap.plannedStart ? this.parseDate(row[columnMap.plannedStart]) : null,
            plannedFinishDate: columnMap.plannedFinish ? this.parseDate(row[columnMap.plannedFinish]) : null,
            actualStartDate,
            actualFinishDate,
            isCriticalPath: columnMap.criticalPath ? this.parseCriticalPath(row[columnMap.criticalPath]) : 'unknown',
          };

          rows.push(parsedRow);
        } catch (rowError) {
          errors.push(`Row ${i + 2}: ${rowError instanceof Error ? rowError.message : 'Parse error'}`);
        }
      }

      const scheduleUpdateMonth = `${options.targetYear}-${String(options.targetMonth).padStart(2, '0')}`;

      return {
        rows,
        scheduleUpdateMonth,
        errors,
        totalRowsProcessed,
        successfulRows: rows.length,
        filteredByMonth,
      };
    } catch (error) {
      return {
        rows: [],
        scheduleUpdateMonth: null,
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        totalRowsProcessed: 0,
        successfulRows: 0,
        filteredByMonth: 0,
      };
    }
  }

  private isInTargetMonth(
    actualStart: Date | null, 
    actualFinish: Date | null, 
    options: ScheduleParseOptions
  ): boolean {
    const checkDate = (date: Date | null): boolean => {
      if (!date) return false;
      return date.getFullYear() === options.targetYear && 
             (date.getMonth() + 1) === options.targetMonth;
    };

    return checkDate(actualStart) || checkDate(actualFinish);
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
}
