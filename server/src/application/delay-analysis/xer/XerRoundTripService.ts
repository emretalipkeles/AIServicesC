import { randomUUID } from "node:crypto";
import type { IDelayAnalysisProjectRepository } from "../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository";
import type { IXerRepository } from "../../../domain/delay-analysis/repositories/IXerRepository";
import type { XerUploadSummary } from "../../../domain/delay-analysis/repositories/IXerRepository";
import { XerRun } from "../../../domain/delay-analysis/entities/XerRun";
import { XerUpload } from "../../../domain/delay-analysis/entities/XerUpload";
import { diffXer } from "../../../domain/delay-analysis/xer/XerDiffEngine";
import { parseXer } from "../../../domain/delay-analysis/xer/XerParser";
import { writeXer } from "../../../domain/delay-analysis/xer/XerWriter";
import { XerParseError } from "../../../domain/delay-analysis/xer/XerTypes";
import { sha256Hex } from "../../../domain/delay-analysis/xer/XerHash";
import { buildStructuralSide } from "../../../domain/delay-analysis/xer/XerStructuralSummary";
import { evaluateRunIntegrity, type XerRunIntegrityStatus } from "../../../domain/delay-analysis/xer/XerRunIntegrity";

export class CompletedProjectRequiredError extends Error {
  readonly name = "CompletedProjectRequiredError";
}

/**
 * Everything needed to independently confirm a run's result outside this
 * application: the hashes and structural facts, regenerated on demand from
 * durably-stored data rather than cached at run time. Calling this again
 * later for the same run always reproduces the same record.
 */
export interface XerVerificationRecord {
  runId: string;
  uploadId: string;
  projectId: string;
  originalFilename: string;
  uploadedAt: string;
  detectedVersion: string | null;
  outcome: XerRun["outcome"];
  /**
   * Whether the evidence for a "clean" outcome (output file + both hashes,
   * matching) is actually present. Never treat `outcome === "clean"` alone
   * as a pass; only `integrityStatus === "verified"` is a confirmed pass.
   */
  integrityStatus: XerRunIntegrityStatus;
  runAt: string;
  originalSha256: string | null;
  outputSha256: string | null;
  structuralSummary: XerRun["structuralSummary"];
  errorMessage: string | null;
}

export class XerRoundTripService {
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024;
  constructor(
    private readonly projectRepository: IDelayAnalysisProjectRepository,
    private readonly xerRepository: IXerRepository,
  ) {}

  private async requireCompleted(projectId: string, tenantId: string): Promise<void> {
    const project = await this.projectRepository.findById(projectId, tenantId);
    if (!project || project.status !== "completed") {
      throw new CompletedProjectRequiredError("XER round-trip analysis is available only for completed projects");
    }
  }

  async upload(
    projectId: string,
    tenantId: string,
    file: { filename: string; contentType: string; buffer: Buffer },
  ): Promise<XerUpload> {
    await this.requireCompleted(projectId, tenantId);
    const extension = file.filename.toLowerCase().slice(file.filename.lastIndexOf("."));
    if (
      extension !== ".xer" ||
      file.filename.length > 255 ||
      /[\/\\\u0000-\u001f]/.test(file.filename) ||
      file.buffer.length === 0 ||
      file.buffer.length > XerRoundTripService.MAX_FILE_SIZE
    ) {
      throw new Error("Only non-empty Primavera .xer files are allowed");
    }
    const start = file.buffer.subarray(0, 16);
    const offset = start.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? 3 : 0;
    const signature = start.subarray(offset).toString("ascii");
    if (!["ERMHDR", "%T\t", "%F\t", "%R\t", "%E"].some((prefix) => signature.startsWith(prefix))) {
      throw new Error("The uploaded file does not contain a recognized Primavera XER record signature");
    }
    let detectedVersion: string | null = null;
    let parseError: string | null = null;
    try {
      detectedVersion = parseXer(file.buffer).detectedVersion;
    } catch (error) {
      parseError = error instanceof Error ? error.message : "XER could not be parsed";
      if (error instanceof XerParseError) detectedVersion = error.detectedVersion ?? null;
    }
    const upload = new XerUpload({
      id: randomUUID(),
      projectId,
      tenantId,
      filename: file.filename,
      contentType: "application/xer",
      detectedVersion,
      fileData: Buffer.from(file.buffer),
      parseError,
      createdAt: new Date(),
    });
    await this.xerRepository.saveUpload(upload);
    return upload;
  }

  async list(projectId: string, tenantId: string): Promise<XerUploadSummary[]> {
    await this.requireCompleted(projectId, tenantId);
    return this.xerRepository.listUploads(projectId, tenantId);
  }

  async run(uploadId: string, projectId: string, tenantId: string): Promise<XerRun> {
    await this.requireCompleted(projectId, tenantId);
    const upload = await this.xerRepository.findUpload(uploadId, projectId, tenantId);
    if (!upload) throw new Error("XER upload not found");
    const id = randomUUID();
    let run: XerRun;
    try {
      const original = parseXer(upload.fileData);
      const output = writeXer(original);
      const generated = parseXer(output);
      const report = diffXer(original, generated, upload.fileData, output);
      run = new XerRun({
        id, uploadId, projectId, tenantId,
        outcome: report.outcome,
        detectedVersion: original.detectedVersion,
        diffReport: report,
        outputData: output,
        errorMessage: null,
        originalSha256: sha256Hex(upload.fileData),
        outputSha256: sha256Hex(output),
        structuralSummary: {
          original: buildStructuralSide(original, upload.fileData.length),
          output: buildStructuralSide(generated, output.length),
        },
        createdAt: new Date(),
      });
    } catch (error) {
      const parseError = error instanceof XerParseError ? error : null;
      run = new XerRun({
        id, uploadId, projectId, tenantId,
        outcome: "stopped",
        detectedVersion: parseError?.detectedVersion ?? upload.detectedVersion,
        diffReport: null,
        outputData: null,
        errorMessage: error instanceof Error ? error.message : "XER round-trip stopped",
        // The original bytes are always available even when parsing failed,
        // so this hash still lets a user confirm nothing was silently altered.
        originalSha256: sha256Hex(upload.fileData),
        outputSha256: null,
        structuralSummary: {
          original: buildStructuralSide(null, upload.fileData.length),
          output: null,
        },
        createdAt: new Date(),
      });
    }
    await this.xerRepository.saveRun(run);
    return run;
  }

  async getRun(
    uploadId: string,
    runId: string,
    projectId: string,
    tenantId: string,
  ): Promise<XerRun | null> {
    await this.requireCompleted(projectId, tenantId);
    return this.xerRepository.findRun(runId, uploadId, projectId, tenantId);
  }

  /**
   * Assembles the verification record purely from durably-stored upload and
   * run rows. It performs no new hashing or parsing, so it can be called any
   * number of times — right after the run or much later — and always
   * reproduces the same record from the same stored data.
   */
  async getVerificationRecord(
    uploadId: string,
    runId: string,
    projectId: string,
    tenantId: string,
  ): Promise<XerVerificationRecord | null> {
    await this.requireCompleted(projectId, tenantId);
    const [upload, run] = await Promise.all([
      this.xerRepository.findUpload(uploadId, projectId, tenantId),
      this.xerRepository.findRun(runId, uploadId, projectId, tenantId),
    ]);
    if (!upload || !run) return null;
    const hasOutput = Boolean(run.outputData);
    const integrityStatus = evaluateRunIntegrity({
      outcome: run.outcome,
      hasOutput,
      originalSha256: run.originalSha256,
      outputSha256: run.outputSha256,
    });
    if (integrityStatus === "incomplete_record" || integrityStatus === "hash_mismatch") {
      console.error(
        `XER run ${run.id} (upload ${upload.id}) has outcome "clean" but integrityStatus="${integrityStatus}"`,
        { hasOutput, originalSha256: run.originalSha256, outputSha256: run.outputSha256 },
      );
    }
    return {
      runId: run.id,
      uploadId: upload.id,
      projectId,
      originalFilename: upload.filename,
      uploadedAt: upload.createdAt.toISOString(),
      detectedVersion: run.detectedVersion,
      outcome: run.outcome,
      integrityStatus,
      runAt: run.createdAt.toISOString(),
      originalSha256: run.originalSha256,
      outputSha256: run.outputSha256,
      structuralSummary: run.structuralSummary,
      errorMessage: run.errorMessage,
    };
  }
}
