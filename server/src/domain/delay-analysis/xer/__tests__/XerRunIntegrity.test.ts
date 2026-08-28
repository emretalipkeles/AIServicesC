import { describe, expect, it } from "vitest";
import { evaluateRunIntegrity } from "../XerRunIntegrity";

describe("evaluateRunIntegrity", () => {
  it("is not_applicable for any outcome other than clean, regardless of hashes", () => {
    for (const outcome of ["differences", "incomplete", "stopped"] as const) {
      expect(evaluateRunIntegrity({ outcome, hasOutput: false, originalSha256: null, outputSha256: null }))
        .toBe("not_applicable");
    }
  });

  it("is verified only when outcome is clean AND output AND both hashes are present and equal", () => {
    expect(evaluateRunIntegrity({
      outcome: "clean", hasOutput: true, originalSha256: "abc", outputSha256: "abc",
    })).toBe("verified");
  });

  it("is incomplete_record when outcome is clean but the output file is missing", () => {
    expect(evaluateRunIntegrity({
      outcome: "clean", hasOutput: false, originalSha256: "abc", outputSha256: "abc",
    })).toBe("incomplete_record");
  });

  it("is incomplete_record when outcome is clean but either hash is null (e.g. a pre-feature run)", () => {
    expect(evaluateRunIntegrity({
      outcome: "clean", hasOutput: true, originalSha256: null, outputSha256: "abc",
    })).toBe("incomplete_record");
    expect(evaluateRunIntegrity({
      outcome: "clean", hasOutput: true, originalSha256: "abc", outputSha256: null,
    })).toBe("incomplete_record");
  });

  it("is hash_mismatch when outcome is clean, both hashes present, but they disagree", () => {
    expect(evaluateRunIntegrity({
      outcome: "clean", hasOutput: true, originalSha256: "abc", outputSha256: "def",
    })).toBe("hash_mismatch");
  });

  it("never reports verified when any single piece of evidence is missing", () => {
    const base = { outcome: "clean" as const, hasOutput: true, originalSha256: "abc", outputSha256: "abc" };
    expect(evaluateRunIntegrity({ ...base, hasOutput: false })).not.toBe("verified");
    expect(evaluateRunIntegrity({ ...base, originalSha256: null })).not.toBe("verified");
    expect(evaluateRunIntegrity({ ...base, outputSha256: null })).not.toBe("verified");
  });
});
