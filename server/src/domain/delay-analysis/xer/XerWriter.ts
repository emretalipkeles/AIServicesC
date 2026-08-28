import { XerDocument, XerRecord } from "./XerTypes";

const CP1252_REVERSE: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
  "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
  "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
  "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b,
  "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function encodeCp1252(text: string): Buffer {
  const output: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (code <= 0xff) output.push(code);
    else if (CP1252_REVERSE[character] !== undefined) output.push(CP1252_REVERSE[character]);
    else throw new Error(`Cannot encode character U+${code.toString(16).toUpperCase()} as Windows-1252`);
  }
  return Buffer.from(output);
}

function encode(text: string, document: XerDocument): Buffer {
  if (document.encoding === "windows-1252" || document.encoding === "ascii") return encodeCp1252(text);
  return Buffer.from(text, "utf8");
}

function lineBytes(prefix: string, values: string[], document: XerDocument): Buffer {
  return encode(`${prefix}\t${values.join("\t")}`, document);
}

function unchanged(record: XerRecord, expected: Buffer): boolean {
  return record.rawLine.equals(expected);
}

/**
 * The writer preserves raw record bytes whenever the in-memory values are
 * unchanged. This is what preserves P6's original byte encoding, whitespace,
 * separators, and unusual bytes. If a future phase changes a value, it is
 * encoded strictly in the document's recorded encoding and fails rather than
 * guessing.
 */
export function writeXer(document: XerDocument): Buffer {
  const chunks: Buffer[] = [];
  const ending = document.lineEnding === "\r\n"
    ? Buffer.from("\r\n")
    : document.lineEnding === "\n" ? Buffer.from("\n")
      : document.lineEnding === "\r" ? Buffer.from("\r") : Buffer.alloc(0);
  chunks.push(document.headerLine, ending);
  for (const table of document.tables) {
    const tableBytes = lineBytes("%T", [table.name], document);
    chunks.push(
      unchanged(table.tableRecord, tableBytes) ? table.tableRecord.rawLine : tableBytes,
      table.tableRecord.lineEnding.length ? table.tableRecord.lineEnding : ending,
    );
    const fieldsBytes = lineBytes("%F", table.fields, document);
    const fieldsRecord = table.fieldsRecord;
    chunks.push(
      fieldsRecord && unchanged(fieldsRecord, fieldsBytes) ? fieldsRecord.rawLine : fieldsBytes,
      fieldsRecord?.lineEnding.length ? fieldsRecord.lineEnding : ending,
    );
    for (const row of table.rows) {
      const generated = lineBytes("%R", row.values ?? [], document);
      chunks.push(unchanged(row, generated) ? row.rawLine : generated, row.lineEnding.length ? row.lineEnding : ending);
    }
  }
  chunks.push(document.endLine, document.endLineEnding);
  return Buffer.concat([Buffer.concat(chunks), document.trailingBytes]);
}
