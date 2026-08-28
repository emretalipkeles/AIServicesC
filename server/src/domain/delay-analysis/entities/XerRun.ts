import type { XerDiffReport } from "../xer/XerDiffEngine";
import type { XerStructuralSummary } from "../xer/XerStructuralSummary";

export type XerRunOutcome = "clean" | "differences" | "incomplete" | "stopped";

export interface XerRunProps {
  id: string;
  uploadId: string;
  projectId: string;
  tenantId: string;
  outcome: XerRunOutcome;
  detectedVersion: string | null;
  diffReport: XerDiffReport | null;
  outputData: Buffer | null;
  errorMessage: string | null;
  /** SHA-256 of the original upload's bytes, computed for every run — including stopped ones. */
  originalSha256: string | null;
  /** SHA-256 of the generated round-trip output. Null when no output was produced (stopped runs). */
  outputSha256: string | null;
  /** Table/row/byte-count fingerprint of both sides, for independent sanity-checking outside the diff verdict. */
  structuralSummary: XerStructuralSummary | null;
  createdAt: Date;
}

export class XerRun {
  readonly id: string;
  readonly uploadId: string;
  readonly projectId: string;
  readonly tenantId: string;
  readonly outcome: XerRunOutcome;
  readonly detectedVersion: string | null;
  readonly diffReport: XerDiffReport | null;
  readonly outputData: Buffer | null;
  readonly errorMessage: string | null;
  readonly originalSha256: string | null;
  readonly outputSha256: string | null;
  readonly structuralSummary: XerStructuralSummary | null;
  readonly createdAt: Date;

  constructor(props: XerRunProps) {
    this.id = props.id;
    this.uploadId = props.uploadId;
    this.projectId = props.projectId;
    this.tenantId = props.tenantId;
    this.outcome = props.outcome;
    this.detectedVersion = props.detectedVersion;
    this.diffReport = props.diffReport;
    this.outputData = props.outputData;
    this.errorMessage = props.errorMessage;
    this.originalSha256 = props.originalSha256;
    this.outputSha256 = props.outputSha256;
    this.structuralSummary = props.structuralSummary;
    this.createdAt = props.createdAt;
  }
}
