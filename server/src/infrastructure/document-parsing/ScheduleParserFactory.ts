import type { IScheduleParser } from '../../domain/delay-analysis/interfaces/IScheduleParser';
import type { IScheduleParserFactory } from '../../domain/delay-analysis/interfaces/IScheduleParserFactory';

export class ScheduleParserFactory implements IScheduleParserFactory {
  private readonly parsers: IScheduleParser[];

  constructor(parsers: IScheduleParser[]) {
    this.parsers = parsers;
  }

  getParser(contentType: string, filename: string): IScheduleParser | null {
    for (const parser of this.parsers) {
      if (parser.canParse(contentType, filename)) {
        return parser;
      }
    }
    return null;
  }
}
