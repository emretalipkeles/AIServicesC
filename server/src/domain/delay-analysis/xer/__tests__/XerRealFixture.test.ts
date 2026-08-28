import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { diffXer } from "../XerDiffEngine";
import { parseXer } from "../XerParser";
import { writeXer } from "../XerWriter";

describe("real P6 XER fixture", () => {
  it("round-trips the supplied v.135-family export byte-identically", () => {
    const bytes = readFileSync(resolve(process.cwd(), "attached_assets/0_MBRT-135_1787886391210.xer"));
    const original = parseXer(bytes);
    const output = writeXer(original);
    const generated = parseXer(output);
    const report = diffXer(original, generated, bytes, output);
    expect(original.detectedVersion).toBe("20.12");
    expect(original.encoding).toBe("windows-1252");
    expect(original.lineEnding).toBe("\r\n");
    expect(original.tables.find((table) => table.name === "TASKPRED")?.fields).toContain("task_pred_id");
    expect(output).toEqual(bytes);
    expect(report).toMatchObject({ byteIdentical: true, outcome: "clean", differences: [] });
  }, 30_000);

  it("round-trips the supplied v.127 schedule update byte-identically", () => {
    const bytes = readFileSync(resolve(process.cwd(), "attached_assets/0_MBRT-127_1787889727448.xer"));
    const original = parseXer(bytes);
    const firstOutput = writeXer(original);
    const secondOutput = writeXer(parseXer(bytes));
    const generated = parseXer(firstOutput);
    const report = diffXer(original, generated, bytes, firstOutput);
    expect(original.detectedVersion).toBe("20.12");
    expect(original.encoding).toBe("windows-1252");
    expect(original.lineEnding).toBe("\r\n");
    expect(original.tables.find((table) => table.name === "TASKPRED")?.fields).toContain("task_pred_id");
    expect(firstOutput).toEqual(bytes);
    expect(secondOutput).toEqual(firstOutput);
    expect(report).toMatchObject({ byteIdentical: true, outcome: "clean", differences: [] });
  }, 30_000);
});
