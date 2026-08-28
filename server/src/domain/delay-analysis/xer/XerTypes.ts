export type XerEncoding = "windows-1252" | "utf-8" | "ascii";
export type XerLineEnding = "\r\n" | "\n" | "\r" | "";

export interface XerRecord {
  kind: "table" | "fields" | "row" | "end";
  tableName?: string;
  fields?: string[];
  values?: string[];
  lineNumber: number;
  rawLine: Buffer;
  lineEnding: Buffer;
}

export interface XerTable {
  name: string;
  fields: string[];
  rows: XerRecord[];
  tableRecord: XerRecord;
  fieldsRecord?: XerRecord;
  tableLineNumber: number;
  fieldsLineNumber: number;
}

export interface XerDocument {
  headerLine: Buffer;
  headerFields: string[];
  detectedVersion: string;
  encoding: XerEncoding;
  lineEnding: XerLineEnding;
  tables: XerTable[];
  endLine: Buffer;
  endLineEnding: Buffer;
  endLineNumber: number;
  trailingBytes: Buffer;
  originalBytes: Buffer;
}

export type XerErrorCode =
  | "NO_ERMHDR"
  | "MALFORMED_ERMHDR"
  | "UNSUPPORTED_ERMHDR_VERSION"
  | "ROW_FIELD_COUNT_MISMATCH"
  | "TABLE_WITHOUT_FIELDS"
  | "UNKNOWN_RECORD_PREFIX"
  | "DUPLICATE_TABLE"
  | "ROW_BEFORE_TABLE"
  | "MISSING_END";

export class XerParseError extends Error {
  readonly name = "XerParseError";
  constructor(
    readonly code: XerErrorCode,
    message: string,
    readonly lineNumber?: number,
    readonly tableName?: string,
    readonly detectedVersion?: string,
  ) {
    super(message);
  }
}
