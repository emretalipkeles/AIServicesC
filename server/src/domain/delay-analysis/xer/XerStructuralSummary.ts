import type { XerDocument } from "./XerTypes";

/**
 * A plain structural fingerprint of one side (original or output) of a
 * round-trip: how many bytes, how many tables, and how many rows per table.
 * This is purely descriptive — it never drives the pass/fail outcome — and
 * lets a user sanity-check a run without trusting the diff engine's verdict.
 */
export interface XerStructuralSide {
  byteCount: number;
  tableCount: number | null;
  rowCountsByTable: Record<string, number> | null;
}

export interface XerStructuralSummary {
  original: XerStructuralSide;
  output: XerStructuralSide | null;
}

/**
 * Builds a structural side from a parsed document (or `null` when parsing
 * never succeeded, e.g. a stopped run) and the exact byte length of the
 * corresponding buffer.
 */
export function buildStructuralSide(document: XerDocument | null, byteLength: number): XerStructuralSide {
  if (!document) {
    return { byteCount: byteLength, tableCount: null, rowCountsByTable: null };
  }
  const rowCountsByTable: Record<string, number> = {};
  for (const table of document.tables) {
    rowCountsByTable[table.name] = table.rows.length;
  }
  return {
    byteCount: byteLength,
    tableCount: document.tables.length,
    rowCountsByTable,
  };
}
