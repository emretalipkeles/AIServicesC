import { describe, expect, it } from "vitest";
import { diffXer } from "../XerDiffEngine";
import { parseXer } from "../XerParser";

const header = "ERMHDR\tv.135\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n";
const fixture = () => parseXer(Buffer.from(
  header +
  "%T\tPROJECT\r\n%F\tproj_id\tname\r\n%R\tp1\tOne\r\n%R\tp2\tTwo\r\n" +
  "%T\tTASK\r\n%F\ttask_id\ttask_name\r\n%R\tt1\tTask one\r\n%E\r\n",
));
const compare = (before: ReturnType<typeof fixture>, after: ReturnType<typeof fixture>) =>
  diffXer(before, after, Buffer.from("before"), Buffer.from("after"));

describe("XER diff categories", () => {
  it("itemizes table presence", () => {
    const before = fixture();
    const after = fixture();
    after.tables.pop();
    expect(compare(before, after).differences.some((item) => item.category === "table_presence")).toBe(true);
  });

  it("itemizes table order", () => {
    const before = fixture();
    const after = fixture();
    after.tables.reverse();
    expect(compare(before, after).differences.some((item) => item.category === "table_order")).toBe(true);
  });

  it("separates field presence from field order", () => {
    const before = fixture();
    const reordered = fixture();
    reordered.tables[0].fields.reverse();
    expect(compare(before, reordered).differences.some((item) => item.category === "field_order")).toBe(true);
    const changed = fixture();
    changed.tables[0].fields[1] = "description";
    expect(compare(before, changed).differences.some((item) => item.category === "field_list")).toBe(true);
  });

  it("itemizes row count and exact cell values", () => {
    const before = fixture();
    const fewer = fixture();
    fewer.tables[0].rows.pop();
    expect(compare(before, fewer).differences.some((item) => item.category === "row_count")).toBe(true);
    const changed = fixture();
    changed.tables[0].rows[0].values![1] = "";
    const cell = compare(before, changed).differences.find((item) => item.category === "row_value");
    expect(cell).toMatchObject({ table: "PROJECT", identityKey: "p1", field: "name", original: "One", generated: "" });
  });

  it("reports row order independently when unique identities move", () => {
    const before = fixture();
    const after = fixture();
    after.tables[0].rows.reverse();
    expect(compare(before, after).differences.some((item) => item.category === "row_order")).toBe(true);
  });

  it("reports whole-file encoding and line-ending observations", () => {
    const before = fixture();
    const after = fixture();
    after.encoding = "windows-1252";
    after.lineEnding = "\n";
    const categories = compare(before, after).differences.map((item) => item.category);
    expect(categories).toContain("file_encoding");
    expect(categories).toContain("line_ending");
  });

  it("itemizes an ERMHDR-only value change", () => {
    const beforeBytes = Buffer.from(header + "%T\tPROJECT\r\n%F\tproj_id\r\n%R\tp1\r\n%E\r\n");
    const afterBytes = Buffer.from(header.replace("v.135", "v.134") + "%T\tPROJECT\r\n%F\tproj_id\r\n%R\tp1\r\n%E\r\n");
    const report = diffXer(parseXer(beforeBytes), parseXer(afterBytes), beforeBytes, afterBytes);
    expect(report.differences).toContainEqual(expect.objectContaining({
      category: "header_value",
      field: "ERMHDR[1]",
      original: "v.135",
      generated: "v.134",
    }));
  });

  it("itemizes a line-ending-only change at the exact physical record", () => {
    const beforeBytes = Buffer.from(header + "%T\tPROJECT\r\n%F\tproj_id\r\n%R\tp1\r\n%E\r\n");
    const afterBytes = Buffer.from(header + "%T\tPROJECT\r\n%F\tproj_id\r\n%R\tp1\n%E\r\n");
    const report = diffXer(parseXer(beforeBytes), parseXer(afterBytes), beforeBytes, afterBytes);
    expect(report.differences).toContainEqual(expect.objectContaining({
      category: "line_ending",
      table: "PROJECT",
      original: { hex: "0d0a", length: 2 },
      generated: { hex: "0a", length: 1 },
    }));
  });

  it("itemizes exact trailing bytes after %E", () => {
    const beforeBytes = Buffer.from(header + "%E\r\none");
    const afterBytes = Buffer.from(header + "%E\r\ntwo");
    const report = diffXer(parseXer(beforeBytes), parseXer(afterBytes), beforeBytes, afterBytes);
    expect(report.differences).toContainEqual(expect.objectContaining({
      category: "trailing_bytes",
      original: { hex: "6f6e65", length: 3 },
      generated: { hex: "74776f", length: 3 },
    }));
  });

  it("never returns an empty report for a byte mismatch", () => {
    const document = fixture();
    const report = diffXer(document, document, Buffer.from("before"), Buffer.from("after"));
    expect(report.byteIdentical).toBe(false);
    expect(report.differences).toContainEqual(expect.objectContaining({ category: "raw_bytes" }));
  });

  it("states when an unregistered table falls back to positional comparison", () => {
    const before = parseXer(Buffer.from(header + "%T\tUDFVALUE\r\n%F\tudf_type_id\tvalue\r\n%R\t1\told\r\n%E\r\n"));
    const after = parseXer(Buffer.from(header + "%T\tUDFVALUE\r\n%F\tudf_type_id\tvalue\r\n%R\t1\tnew\r\n%E\r\n"));
    expect(compare(before, after).differences.some((item) => item.category === "row_identity_skipped")).toBe(true);
  });

  it("itemizes every surplus positional row with its exact values", () => {
    const beforeBytes = Buffer.from(header + "%T\tUDFVALUE\r\n%F\tudf_type_id\tvalue\r\n%R\t1\told\r\n%E\r\n");
    const afterBytes = Buffer.from(header + "%T\tUDFVALUE\r\n%F\tudf_type_id\tvalue\r\n%R\t1\told\r\n%R\t2\tnew\r\n%E\r\n");
    const report = diffXer(parseXer(beforeBytes), parseXer(afterBytes), beforeBytes, afterBytes);
    expect(report.differences).toContainEqual(expect.objectContaining({
      category: "row_value",
      table: "UDFVALUE",
      identityKey: "position 2",
      original: "absent",
      generated: ["2", "new"],
    }));
  });

  it("compares positionally when a registered table lacks its configured identity field", () => {
    const before = parseXer(Buffer.from(header + "%T\tTASK\r\n%F\tname\r\n%R\told\r\n%E\r\n"));
    const after = parseXer(Buffer.from(header + "%T\tTASK\r\n%F\tname\r\n%R\tnew\r\n%E\r\n"));
    const differences = compare(before, after).differences;
    expect(differences.some((item) => item.category === "row_identity_skipped" && item.table === "TASK")).toBe(true);
    expect(differences.some((item) => item.category === "row_value" && item.original === "old" && item.generated === "new")).toBe(true);
  });

  it("does not positionally pair rows when a registered identity is duplicated", () => {
    const before = fixture();
    const after = fixture();
    after.tables[0].rows[1].values![0] = "p1";
    after.tables[0].rows[1].values![1] = "Changed";
    const report = compare(before, after);
    expect(report.outcome).toBe("incomplete");
    expect(report.differences.some((item) => item.category === "duplicate_identity")).toBe(true);
    expect(report.differences.some((item) => item.category === "row_value" && item.identityKey === "position 2")).toBe(false);
  });
});
