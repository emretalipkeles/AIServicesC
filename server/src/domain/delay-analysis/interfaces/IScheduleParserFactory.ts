import type { IScheduleParser } from './IScheduleParser';

export interface IScheduleParserFactory {
  getParser(contentType: string, filename: string): IScheduleParser | null;
}
