import type { XerRun } from "../entities/XerRun";

export type XerRunIntegrityStatus =
  | "verified"
  | "incomplete_record"
  | "hash_mismatch"
  | "not_applicable";

export interface XerRunIntegrityInput {
  outcome: XerRun["outcome"];
  hasOutput: boolean;
  originalSha256: string | null;
  outputSha256: string | null;
}

/**
 * The diff engine's stored `outcome` is the authoritative pass/fail verdict
 * and must never be altered here. This function only decides whether a
 * `clean` ("byte-identical") outcome currently has enough independently
 * verifiable evidence — an output file plus both hashes, and those hashes
 * actually matching — to be *displayed* as a trustworthy pass.
 *
 * A `clean` outcome with a missing output/hash is a data-integrity
 * contradiction (most commonly a run stored before this verification data
 * existed), and a `clean` outcome whose hashes disagree is a deeper
 * contradiction that should never occur if the diff engine is correct.
 * Neither should ever render as a pass badge.
 */
export function evaluateRunIntegrity(run: XerRunIntegrityInput): XerRunIntegrityStatus {
  if (run.outcome !== "clean") return "not_applicable";
  if (!run.hasOutput || !run.originalSha256 || !run.outputSha256) return "incomplete_record";
  if (run.originalSha256 !== run.outputSha256) return "hash_mismatch";
  return "verified";
}
