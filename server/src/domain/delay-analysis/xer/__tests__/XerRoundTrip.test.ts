import { describe, expect, it } from "vitest";
import { diffXer } from "../XerDiffEngine";
import { identityForRow } from "../XerIdentityRegistry";
import { parseXer } from "../XerParser";
import { writeXer } from "../XerWriter";
import { XerParseError } from "../XerTypes";

const valid = (version = "v.135") => Buffer.from(
  `ERMHDR\t${version}\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n` +
  `%T\tPROJECT\r\n%F\tproj_id\tname\r\n%R\tp1\tCafé\r\n` +
  `%T\tTASKPRED\r\n%F\ttask_pred_id\tpred_task_id\ttask_id\tpred_type\r\n` +
  `%R\tp1\tA\tB\tFS\r\n%E\r\n`,
  "latin1",
);

const header = "ERMHDR\tv.135\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n";

describe("XER parser and writer", () => {
  it("round-trips bytes without normalizing CRLF, empty values, or cp1252 characters", () => {
    const bytes = valid();
    const model = parseXer(bytes);
    expect(writeXer(model)).toEqual(bytes);
    expect(writeXer(model)).toEqual(writeXer(parseXer(bytes)));
    expect(model.tables[0].rows[0].values).toEqual(["p1", "Café"]);
  });

  it("preserves a UTF-8 BOM and trailing bytes after %E exactly", () => {
    const body = Buffer.from(valid().toString("latin1").replace("Café", "Cafe").replace("%E\r\n", "%E"));
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body, Buffer.from([0, 1, 2])]);
    const model = parseXer(bytes);
    expect(model.encoding).toBe("utf-8");
    expect(model.trailingBytes).toEqual(Buffer.from([0, 1, 2]));
    expect(writeXer(model)).toEqual(bytes);
  });

  it("preserves mixed physical line endings exactly", () => {
    const bytes = Buffer.from(
      "ERMHDR\tv.135\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n" +
      "%T\tPROJECT\n%F\tproj_id\tname\r%R\tp1\tOne\r\n%E",
    );
    expect(writeXer(parseXer(bytes))).toEqual(bytes);
  });

  it.each([
    ["NO_ERMHDR", Buffer.from("%T\tTASK\r\n%E\r\n")],
    ["MALFORMED_ERMHDR", Buffer.from("ERMHDR\t\r\n%E\r\n")],
    ["UNSUPPORTED_ERMHDR_VERSION", valid("v.999")],
    ["ROW_FIELD_COUNT_MISMATCH", Buffer.from(header + "%T\tTASK\r\n%F\ttask_id\tname\r\n%R\tone\r\n%E\r\n")],
    ["TABLE_WITHOUT_FIELDS", Buffer.from(header + "%T\tTASK\r\n%R\tone\r\n%E\r\n")],
    ["UNKNOWN_RECORD_PREFIX", Buffer.from(header + "%Q\tno\r\n%E\r\n")],
    ["DUPLICATE_TABLE", Buffer.from(header + "%T\tTASK\r\n%F\ttask_id\r\n%T\tTASK\r\n%F\ttask_id\r\n%E\r\n")],
    ["ROW_BEFORE_TABLE", Buffer.from(header + "%R\tno\r\n%E\r\n")],
    ["MISSING_END", Buffer.from(header + "%T\tTASK\r\n%F\ttask_id\r\n%R\tone\r\n")],
  ] as const)("stops with distinct %s error", (code, bytes) => {
    expect(() => parseXer(bytes)).toThrowError(expect.objectContaining({ code }));
  });
});

describe("XER identities and diff", () => {
  it("uses the surrogate TASKPRED key and only uses the older fallback when needed", () => {
    expect(identityForRow("TASKPRED", ["task_pred_id", "task_id"], ["surrogate", "task"], 1)?.key).toBe("surrogate");
    expect(identityForRow("TASKPRED", ["pred_task_id", "task_id", "pred_type"], ["A", "B", "FS"], 1)?.key).toBe("A\u001fB\u001fFS");
  });

  it("reports duplicates as incomplete and never silently pairs them", () => {
    const original = parseXer(valid());
    const generated = parseXer(Buffer.from(valid().toString("latin1").replace("%R\tp1\tCafé", "%R\tp1\tCafé\r\n%R\tp1\tAgain")));
    const report = diffXer(original, generated, valid(), writeXer(generated));
    expect(report.outcome).toBe("incomplete");
    expect(report.differences.some((item) => item.category === "duplicate_identity" && item.table === "PROJECT")).toBe(true);
  });

  it("keeps ordering categories distinct", () => {
    const original = parseXer(valid());
    const reordered = parseXer(valid());
    reordered.tables.reverse();
    const report = diffXer(original, reordered, valid(), Buffer.from("different"));
    expect(report.differences.some((item) => item.category === "table_order")).toBe(true);
  });
});
