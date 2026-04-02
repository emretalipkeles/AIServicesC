export { ParsedScheduleRow } from './IExcelParser';
import type { ParsedScheduleRow } from './IExcelParser';
import type { IProgressReporter } from './IProgressReporter';
import type { TokenUsageCallback } from './ITokenUsageRecorder';

export interface ScheduleParseOptions {
  filterActualOnly: boolean;
  progressReporter?: IProgressReporter;
  tokenUsageCallback?: TokenUsageCallback;
  runId?: string;
}

export interface ScheduleParseResult {
  rows: ParsedScheduleRow[];
  scheduleUpdateMonth: string | null;
  errors: string[];
  totalRowsProcessed: number;
  successfulRows: number;
}

export interface IScheduleParser {
  canParse(contentType: string, filename: string): boolean;
  parseSchedule(
    buffer: Buffer,
    filename: string,
    options: ScheduleParseOptions
  ): Promise<ScheduleParseResult>;
}
