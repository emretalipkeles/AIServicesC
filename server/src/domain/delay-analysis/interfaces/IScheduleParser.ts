export { ParsedScheduleRow } from './IExcelParser';
import type { ParsedScheduleRow } from './IExcelParser';
import type { IProgressReporter } from './IProgressReporter';

export interface ScheduleParseOptions {
  targetMonth: number;
  targetYear: number;
  filterActualOnly: boolean;
  progressReporter?: IProgressReporter;
}

export interface ScheduleParseResult {
  rows: ParsedScheduleRow[];
  scheduleUpdateMonth: string | null;
  errors: string[];
  totalRowsProcessed: number;
  successfulRows: number;
  filteredByMonth: number;
}

export interface IScheduleParser {
  canParse(contentType: string, filename: string): boolean;
  parseSchedule(
    buffer: Buffer,
    filename: string,
    options: ScheduleParseOptions
  ): Promise<ScheduleParseResult>;
}
