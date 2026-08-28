import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../XerHash";
import { buildStructuralSide } from "../XerStructuralSummary";
import { parseXer } from "../XerParser";
import { diffXer } from "../XerDiffEngine";

const valid = Buffer.from(
  "ERMHDR\tv.135\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n" +
  "%T\tPROJECT\r\n%F\tproj_id\tname\r\n%R\tp1\tOne\r\n%R\tp2\tTwo\r\n" +
  "%T\tTASK\r\n%F\ttask_id\tname\r\n%R\tt1\tActivity\r\n%E\r\n",
);

describe("sha256Hex", () => {
  it("matches a direct node:crypto sha256 digest", () => {
    const bytes = Buffer.from("some xer bytes\r\n");
    expect(sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("is a pure function of the bytes: same input always produces the same digest", () => {
    const bytes = Buffer.from(valid);
    expect(sha256Hex(bytes)).toBe(sha256Hex(Buffer.from(bytes)));
  });

  it("produces different digests for different bytes", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });
});

describe("buildStructuralSide", () => {
  it("reports byte count, table count, and per-table row counts for a parsed document", () => {
    const document = parseXer(valid);
    const side = buildStructuralSide(document, valid.length);
    expect(side).toEqual({
      byteCount: valid.length,
      tableCount: 2,
      rowCountsByTable: { PROJECT: 2, TASK: 1 },
    });
  });

  it("reports only the byte count, with null table/row facts, when no document is available", () => {
    const side = buildStructuralSide(null, 42);
    expect(side).toEqual({ byteCount: 42, tableCount: null, rowCountsByTable: null });
  });
});

describe("diffXer hash fields", () => {
  it("computes originalSha256/generatedSha256 using the same sha256Hex used for verification", () => {
    const document = parseXer(valid);
    const report = diffXer(document, document, valid, valid);
    expect(report.originalSha256).toBe(sha256Hex(valid));
    expect(report.generatedSha256).toBe(sha256Hex(valid));
  });
});
