export interface ParsedScheduleRow {
  activityId: string;
  wbs: string | null;
  activityDescription: string;
  plannedStartDate: Date | null;
  plannedFinishDate: Date | null;
  actualStartDate: Date | null;
  actualFinishDate: Date | null;
  isCriticalPath: string;
}

export interface ExcelParseResult {
  rows: ParsedScheduleRow[];
  scheduleUpdateMonth: string | null;
  errors: string[];
  totalRowsProcessed: number;
  successfulRows: number;
}

export interface IExcelParser {
  canParse(contentType: string): boolean;
  parseSchedule(buffer: Buffer, filename: string): Promise<ExcelParseResult>;
}
