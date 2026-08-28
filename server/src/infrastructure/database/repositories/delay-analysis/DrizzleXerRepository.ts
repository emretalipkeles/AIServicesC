import { and, desc, eq, sql } from "drizzle-orm";
import { xerRuns, xerUploads } from "@shared/schema";
import { db } from "../../../database";
import type {
  IXerRepository,
  XerRunSummary,
  XerUploadSummary,
} from "../../../../domain/delay-analysis/repositories/IXerRepository";
import { XerRun } from "../../../../domain/delay-analysis/entities/XerRun";
import { XerUpload } from "../../../../domain/delay-analysis/entities/XerUpload";

type UploadRow = typeof xerUploads.$inferSelect;
type RunRow = typeof xerRuns.$inferSelect;

function mapUpload(row: UploadRow): XerUpload {
  return new XerUpload({
    id: row.id,
    projectId: row.projectId,
    tenantId: row.tenantId,
    filename: row.filename,
    contentType: row.contentType,
    detectedVersion: row.detectedVersion,
    fileData: row.fileData,
    parseError: row.parseError,
    createdAt: row.createdAt ?? new Date(),
  });
}

function mapRun(row: RunRow): XerRun {
  return new XerRun({
    id: row.id,
    uploadId: row.uploadId,
    projectId: row.projectId,
    tenantId: row.tenantId,
    outcome: row.outcome as XerRun["outcome"],
    detectedVersion: row.detectedVersion,
    diffReport: row.diffReport as XerRun["diffReport"],
    outputData: row.outputData,
    errorMessage: row.errorMessage,
    originalSha256: row.originalSha256,
    outputSha256: row.outputSha256,
    structuralSummary: row.structuralSummary as XerRun["structuralSummary"],
    createdAt: row.createdAt ?? new Date(),
  });
}

export class DrizzleXerRepository implements IXerRepository {
  async saveUpload(upload: XerUpload): Promise<void> {
    await db.insert(xerUploads).values({
      id: upload.id,
      projectId: upload.projectId,
      tenantId: upload.tenantId,
      filename: upload.filename,
      contentType: upload.contentType,
      detectedVersion: upload.detectedVersion,
      fileData: upload.fileData,
      parseError: upload.parseError,
      createdAt: upload.createdAt,
    });
  }

  async findUpload(id: string, projectId: string, tenantId: string): Promise<XerUpload | null> {
    const rows = await db.select().from(xerUploads).where(and(
      eq(xerUploads.id, id),
      eq(xerUploads.projectId, projectId),
      eq(xerUploads.tenantId, tenantId),
    )).limit(1);
    return rows[0] ? mapUpload(rows[0]) : null;
  }

  async listUploads(projectId: string, tenantId: string): Promise<XerUploadSummary[]> {
    const uploads = await db.select({
      id: xerUploads.id,
      projectId: xerUploads.projectId,
      tenantId: xerUploads.tenantId,
      filename: xerUploads.filename,
      contentType: xerUploads.contentType,
      detectedVersion: xerUploads.detectedVersion,
      parseError: xerUploads.parseError,
      createdAt: xerUploads.createdAt,
    }).from(xerUploads).where(and(
      eq(xerUploads.projectId, projectId),
      eq(xerUploads.tenantId, tenantId),
    )).orderBy(desc(xerUploads.createdAt));
    const runs = await db.select({
      id: xerRuns.id,
      uploadId: xerRuns.uploadId,
      projectId: xerRuns.projectId,
      tenantId: xerRuns.tenantId,
      outcome: xerRuns.outcome,
      detectedVersion: xerRuns.detectedVersion,
      diffReport: xerRuns.diffReport,
      errorMessage: xerRuns.errorMessage,
      originalSha256: xerRuns.originalSha256,
      outputSha256: xerRuns.outputSha256,
      structuralSummary: xerRuns.structuralSummary,
      createdAt: xerRuns.createdAt,
      hasOutput: sql<boolean>`${xerRuns.outputData} is not null`,
    }).from(xerRuns).where(and(
      eq(xerRuns.projectId, projectId),
      eq(xerRuns.tenantId, tenantId),
    )).orderBy(desc(xerRuns.createdAt));
    return uploads.map((upload): XerUploadSummary => ({
      ...upload,
      createdAt: upload.createdAt ?? new Date(),
      runs: runs.filter((run) => run.uploadId === upload.id).map((run): XerRunSummary => ({
        ...run,
        outcome: run.outcome as XerRun["outcome"],
        diffReport: run.diffReport as XerRun["diffReport"],
        structuralSummary: run.structuralSummary as XerRun["structuralSummary"],
        createdAt: run.createdAt ?? new Date(),
      })),
    }));
  }

  async saveRun(run: XerRun): Promise<void> {
    await db.insert(xerRuns).values({
      id: run.id,
      uploadId: run.uploadId,
      projectId: run.projectId,
      tenantId: run.tenantId,
      outcome: run.outcome,
      detectedVersion: run.detectedVersion,
      diffReport: run.diffReport,
      outputData: run.outputData,
      errorMessage: run.errorMessage,
      originalSha256: run.originalSha256,
      outputSha256: run.outputSha256,
      structuralSummary: run.structuralSummary,
      createdAt: run.createdAt,
    });
  }

  async findRun(runId: string, uploadId: string, projectId: string, tenantId: string): Promise<XerRun | null> {
    const rows = await db.select().from(xerRuns).where(and(
      eq(xerRuns.id, runId),
      eq(xerRuns.uploadId, uploadId),
      eq(xerRuns.projectId, projectId),
      eq(xerRuns.tenantId, tenantId),
    )).limit(1);
    return rows[0] ? mapRun(rows[0]) : null;
  }
}