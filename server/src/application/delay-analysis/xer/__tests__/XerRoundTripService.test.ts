import { describe, expect, it, vi } from "vitest";
import { XerRoundTripService } from "../XerRoundTripService";
import type { IDelayAnalysisProjectRepository } from "../../../../domain/delay-analysis/repositories/IDelayAnalysisProjectRepository";
import type { IXerRepository } from "../../../../domain/delay-analysis/repositories/IXerRepository";
import { XerUpload } from "../../../../domain/delay-analysis/entities/XerUpload";
import { XerRun } from "../../../../domain/delay-analysis/entities/XerRun";
import { sha256Hex } from "../../../../domain/delay-analysis/xer/XerHash";
import { evaluateRunIntegrity } from "../../../../domain/delay-analysis/xer/XerRunIntegrity";

const validXer = Buffer.from(
  "ERMHDR\tv.135\t2024-08-16\tProject\tcpm\tCPM13\tName\tProject Management\tUSD\r\n" +
  "%T\tPROJECT\r\n%F\tproj_id\tname\r\n%R\tp1\tOne\r\n%E\r\n",
);

describe("XER completed-project authorization", () => {
  it("rejects every operation before accessing XER data for a non-completed project", async () => {
    const projectRepository = {
      findById: vi.fn().mockResolvedValue({ status: "active" }),
    } as unknown as IDelayAnalysisProjectRepository;
    const xerRepository = {
      saveUpload: vi.fn(),
      findUpload: vi.fn(),
      listUploads: vi.fn(),
      saveRun: vi.fn(),
      findRun: vi.fn(),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);
    await expect(service.list("project", "tenant")).rejects.toThrow("only for completed projects");
    await expect(service.upload("project", "tenant", {
      filename: "test.xer", contentType: "application/xer", buffer: Buffer.from("x"),
    })).rejects.toThrow("only for completed projects");
    await expect(service.run("upload", "project", "tenant")).rejects.toThrow("only for completed projects");
    await expect(service.getRun("upload", "run", "project", "tenant")).rejects.toThrow("only for completed projects");
    await expect(service.getVerificationRecord("upload", "run", "project", "tenant")).rejects.toThrow("only for completed projects");
    expect(xerRepository.listUploads).not.toHaveBeenCalled();
    expect(xerRepository.findUpload).not.toHaveBeenCalled();
    expect(xerRepository.findRun).not.toHaveBeenCalled();
  });

  it("rejects arbitrary content before persistence even with a .xer extension", async () => {
    const projectRepository = {
      findById: vi.fn().mockResolvedValue({ status: "completed" }),
    } as unknown as IDelayAnalysisProjectRepository;
    const xerRepository = {
      saveUpload: vi.fn(),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);
    await expect(service.upload("project", "tenant", {
      filename: "not-really.xer",
      contentType: "application/octet-stream",
      buffer: Buffer.from("arbitrary text"),
    })).rejects.toThrow("recognized Primavera XER");
    expect(xerRepository.saveUpload).not.toHaveBeenCalled();
  });
});

describe("XER run verifiability", () => {
  const projectRepository = {
    findById: vi.fn().mockResolvedValue({ status: "completed" }),
  } as unknown as IDelayAnalysisProjectRepository;

  it("computes and persists SHA-256 hashes and a structural summary for a successful run", async () => {
    const upload = new XerUpload({
      id: "upload-1", projectId: "project", tenantId: "tenant",
      filename: "test.xer", contentType: "application/xer",
      detectedVersion: "v.135", fileData: validXer, parseError: null, createdAt: new Date(),
    });
    let savedRun: XerRun | undefined;
    const xerRepository = {
      findUpload: vi.fn().mockResolvedValue(upload),
      saveRun: vi.fn(async (run: XerRun) => { savedRun = run; }),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);

    const run = await service.run("upload-1", "project", "tenant");

    expect(run.outcome).toBe("clean");
    expect(evaluateRunIntegrity({
      outcome: run.outcome, hasOutput: Boolean(run.outputData),
      originalSha256: run.originalSha256, outputSha256: run.outputSha256,
    })).toBe("verified");
    expect(run.originalSha256).toBe(sha256Hex(validXer));
    expect(run.outputSha256).toBe(sha256Hex(run.outputData!));
    expect(run.structuralSummary?.original).toEqual({
      byteCount: validXer.length,
      tableCount: 1,
      rowCountsByTable: { PROJECT: 1 },
    });
    expect(run.structuralSummary?.output).toEqual(run.structuralSummary?.original);
    expect(savedRun).toBe(run);
  });

  it("still hashes the original bytes, but leaves output hash/structure null, when parsing stops the run", async () => {
    const badBytes = Buffer.from("not a real xer file at all");
    const upload = new XerUpload({
      id: "upload-2", projectId: "project", tenantId: "tenant",
      filename: "bad.xer", contentType: "application/xer",
      detectedVersion: null, fileData: badBytes, parseError: "no ERMHDR", createdAt: new Date(),
    });
    const xerRepository = {
      findUpload: vi.fn().mockResolvedValue(upload),
      saveRun: vi.fn(),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);

    const run = await service.run("upload-2", "project", "tenant");

    expect(run.outcome).toBe("stopped");
    expect(run.originalSha256).toBe(sha256Hex(badBytes));
    expect(run.outputSha256).toBeNull();
    expect(run.structuralSummary).toEqual({
      original: { byteCount: badBytes.length, tableCount: null, rowCountsByTable: null },
      output: null,
    });
  });

  it("assembles the verification record from stored upload and run data alone, reproducibly", async () => {
    const uploadedAt = new Date("2026-01-01T00:00:00.000Z");
    const runAt = new Date("2026-01-02T00:00:00.000Z");
    const upload = new XerUpload({
      id: "upload-3", projectId: "project", tenantId: "tenant",
      filename: "schedule.xer", contentType: "application/xer",
      detectedVersion: "v.135", fileData: validXer, parseError: null, createdAt: uploadedAt,
    });
    const run = new XerRun({
      id: "run-1", uploadId: "upload-3", projectId: "project", tenantId: "tenant",
      outcome: "clean", detectedVersion: "v.135", diffReport: null, outputData: validXer,
      errorMessage: null, originalSha256: sha256Hex(validXer), outputSha256: sha256Hex(validXer),
      structuralSummary: { original: { byteCount: validXer.length, tableCount: 1, rowCountsByTable: { PROJECT: 1 } }, output: null },
      createdAt: runAt,
    });
    const xerRepository = {
      findUpload: vi.fn().mockResolvedValue(upload),
      findRun: vi.fn().mockResolvedValue(run),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);

    const record = await service.getVerificationRecord("upload-3", "run-1", "project", "tenant");
    const recordAgain = await service.getVerificationRecord("upload-3", "run-1", "project", "tenant");

    expect(record).toEqual({
      runId: "run-1",
      uploadId: "upload-3",
      projectId: "project",
      originalFilename: "schedule.xer",
      uploadedAt: uploadedAt.toISOString(),
      detectedVersion: "v.135",
      outcome: "clean",
      integrityStatus: "verified",
      runAt: runAt.toISOString(),
      originalSha256: sha256Hex(validXer),
      outputSha256: sha256Hex(validXer),
      structuralSummary: run.structuralSummary,
      errorMessage: null,
    });
    expect(recordAgain).toEqual(record);
  });

  it("marks a stored 'clean' run with a missing hash as incomplete_record, never as a verified pass", async () => {
    // Simulates a run stored before hashing existed: outcome says "clean" but
    // the evidence for that claim was never captured.
    const upload = new XerUpload({
      id: "upload-legacy", projectId: "project", tenantId: "tenant",
      filename: "legacy.xer", contentType: "application/xer",
      detectedVersion: "v.135", fileData: validXer, parseError: null, createdAt: new Date(),
    });
    const legacyRun = new XerRun({
      id: "run-legacy", uploadId: "upload-legacy", projectId: "project", tenantId: "tenant",
      outcome: "clean", detectedVersion: "v.135", diffReport: null, outputData: validXer,
      errorMessage: null, originalSha256: null, outputSha256: null, structuralSummary: null,
      createdAt: new Date(),
    });
    const xerRepository = {
      findUpload: vi.fn().mockResolvedValue(upload),
      findRun: vi.fn().mockResolvedValue(legacyRun),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);

    const record = await service.getVerificationRecord("upload-legacy", "run-legacy", "project", "tenant");

    expect(record?.outcome).toBe("clean");
    expect(record?.integrityStatus).toBe("incomplete_record");
  });

  it("returns null when the run or upload no longer exists, instead of throwing", async () => {
    const xerRepository = {
      findUpload: vi.fn().mockResolvedValue(null),
      findRun: vi.fn().mockResolvedValue(null),
    } as unknown as IXerRepository;
    const service = new XerRoundTripService(projectRepository, xerRepository);
    await expect(service.getVerificationRecord("upload", "run", "project", "tenant")).resolves.toBeNull();
  });
});
