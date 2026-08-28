import {
  XerDocument,
  XerErrorCode,
  XerParseError,
  XerTable,
  XerEncoding,
} from "./XerTypes";
import { supportedXerVersions } from "./XerVersionConfig";

function cp1252Decode(bytes: Buffer): string {
  return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
}

function detectEncoding(bytes: Buffer): XerEncoding {
  // BOMs are retained in the model but do not occur in normal P6 exports.
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return "utf-8";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return bytes.some((byte) => byte >= 0x80) ? "windows-1252" : "ascii";
  }
}

function decode(bytes: Buffer, encoding: XerEncoding): string {
  return encoding === "utf-8"
    ? new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    : cp1252Decode(bytes);
}

interface PhysicalLine {
  bytes: Buffer;
  ending: Buffer;
  lineNumber: number;
  start: number;
  end: number;
}

function splitPhysicalLines(bytes: Buffer): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  let lineNumber = 1;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte !== 0x0a && byte !== 0x0d) continue;
    const endingLength = byte === 0x0d && bytes[index + 1] === 0x0a ? 2 : 1;
    lines.push({
      bytes: bytes.subarray(start, index),
      ending: bytes.subarray(index, index + endingLength),
      lineNumber,
      start,
      end: index + endingLength,
    });
    start = index + endingLength;
    index += endingLength - 1;
    lineNumber += 1;
  }
  if (start < bytes.length) {
    lines.push({
      bytes: bytes.subarray(start),
      ending: Buffer.alloc(0),
      lineNumber,
      start,
      end: bytes.length,
    });
  }
  return lines;
}

function parseHeader(line: PhysicalLine, encoding: XerEncoding): {
  fields: string[];
  version: string;
} {
  const text = decode(line.bytes, encoding).replace(/^\uFEFF/, "");
  const fields = text.split("\t");
  if (
    fields[0] !== "ERMHDR" ||
    fields.length !== 9 ||
    fields.slice(1).some((field) => field.length === 0)
  ) {
    throw new XerParseError(
      "MALFORMED_ERMHDR",
      `Malformed ERMHDR at line ${line.lineNumber}: expected exactly 9 non-empty tab-separated header fields`,
      line.lineNumber,
    );
  }
  const version = fields[1];
  if (!supportedXerVersions.has(version)) {
    throw new XerParseError(
      "UNSUPPORTED_ERMHDR_VERSION",
      `ERMHDR version "${version}" is outside the currently supported set`,
      line.lineNumber,
      undefined,
      version,
    );
  }
  return { fields, version };
}

export function parseXer(bytes: Buffer): XerDocument {
  const originalBytes = Buffer.from(bytes);
  const encoding = detectEncoding(originalBytes);
  const lines = splitPhysicalLines(originalBytes);
  const first = lines[0];
  if (!first || decode(first.bytes, encoding).replace(/^\uFEFF/, "").split("\t")[0] !== "ERMHDR") {
    throw new XerParseError(
      "NO_ERMHDR",
      "No ERMHDR line found at the start of the file; the file could not be identified as an XER",
      first?.lineNumber ?? 1,
    );
  }
  const header = parseHeader(first, encoding);
  const tables: XerTable[] = [];
  const tableNames = new Set<string>();
  let current: XerTable | null = null;
  let endLine: PhysicalLine | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    const text = decode(line.bytes, encoding);
    const prefix = text.slice(0, 2);
    if (prefix === "%E") {
      endLine = {
        ...line,
        bytes: line.bytes.subarray(0, 2),
        ending: line.bytes.length === 2 ? line.ending : Buffer.alloc(0),
        end: line.bytes.length === 2 ? line.end : line.start + 2,
      };
      break;
    }
    if (text.startsWith("%T\t")) {
      const tableName = text.slice(3);
      if (!tableName) {
        throw new XerParseError("UNKNOWN_RECORD_PREFIX", `Empty table name at line ${line.lineNumber}`, line.lineNumber);
      }
      if (tableNames.has(tableName)) {
        throw new XerParseError(
          "DUPLICATE_TABLE",
          `Table "${tableName}" is declared more than once; duplicate table sections cannot be matched unambiguously`,
          line.lineNumber,
          tableName,
        );
      }
      tableNames.add(tableName);
      current = {
        name: tableName,
        fields: [],
        rows: [],
        tableRecord: {
          kind: "table",
          tableName,
          values: [tableName],
          lineNumber: line.lineNumber,
          rawLine: Buffer.from(line.bytes),
          lineEnding: Buffer.from(line.ending),
        },
        tableLineNumber: line.lineNumber,
        fieldsLineNumber: 0,
      };
      tables.push(current);
      continue;
    }
    if (text.startsWith("%F\t")) {
      if (!current) {
        throw new XerParseError("TABLE_WITHOUT_FIELDS", `%F record at line ${line.lineNumber} appears before any table is opened`, line.lineNumber);
      }
      if (current.fields.length > 0) {
        throw new XerParseError("TABLE_WITHOUT_FIELDS", `Table "${current.name}" has more than one %F record at line ${line.lineNumber}`, line.lineNumber, current.name);
      }
      current.fields = text.slice(3).split("\t");
      current.fieldsLineNumber = line.lineNumber;
      current.fieldsRecord = {
        kind: "fields",
        tableName: current.name,
        fields: current.fields,
        lineNumber: line.lineNumber,
        rawLine: Buffer.from(line.bytes),
        lineEnding: Buffer.from(line.ending),
      };
      continue;
    }
    if (text.startsWith("%R\t")) {
      if (!current) {
        throw new XerParseError("ROW_BEFORE_TABLE", `Row at line ${line.lineNumber} appears before any table is opened`, line.lineNumber);
      }
      if (current.fields.length === 0) {
        throw new XerParseError("TABLE_WITHOUT_FIELDS", `Table "${current.name}" has a row at line ${line.lineNumber} but no following %F field record`, line.lineNumber, current.name);
      }
      const values = text.slice(3).split("\t");
      if (values.length !== current.fields.length) {
        throw new XerParseError(
          "ROW_FIELD_COUNT_MISMATCH",
          `Table "${current.name}" row at line ${line.lineNumber} has ${values.length} values but %F declares ${current.fields.length} fields`,
          line.lineNumber,
          current.name,
        );
      }
      current.rows.push({
        kind: "row",
        tableName: current.name,
        values,
        lineNumber: line.lineNumber,
        rawLine: Buffer.from(line.bytes),
        lineEnding: Buffer.from(line.ending),
      });
      continue;
    }
    throw new XerParseError(
      "UNKNOWN_RECORD_PREFIX",
      `Unknown XER record prefix "${prefix}" at line ${line.lineNumber}; expected %T, %F, %R, or %E`,
      line.lineNumber,
      current?.name,
    );
  }

  if (!endLine) {
    throw new XerParseError("MISSING_END", "Missing %E record at the end of the XER file", lines.at(-1)?.lineNumber ?? 1);
  }
  for (const table of tables) {
    if (table.fields.length === 0) {
      throw new XerParseError(
        "TABLE_WITHOUT_FIELDS",
        `Table "${table.name}" at line ${table.tableLineNumber} has no following %F field record`,
        table.tableLineNumber,
        table.name,
      );
    }
    if (!table.fieldsRecord) {
      throw new XerParseError(
        "TABLE_WITHOUT_FIELDS",
        `Table "${table.name}" at line ${table.tableLineNumber} has no following %F field record`,
        table.tableLineNumber,
        table.name,
      );
    }
  }
  const lineEnding = first.ending.length === 2 ? "\r\n" : first.ending.length === 1 ? (first.ending[0] === 0x0a ? "\n" : "\r") : "";
  return {
    headerLine: Buffer.from(first.bytes),
    headerFields: header.fields,
    detectedVersion: header.version,
    encoding,
    lineEnding,
    tables,
    endLine: Buffer.from(endLine.bytes),
    endLineEnding: Buffer.from(endLine.ending),
    endLineNumber: endLine.lineNumber,
    trailingBytes: Buffer.from(originalBytes.subarray(endLine.end)),
    originalBytes,
  };
}
