import type { Request, Response } from "express";
import { z } from "zod";
import {
  CompletedProjectRequiredError,
  XerRoundTripService,
} from "../../application/delay-analysis/xer/XerRoundTripService";
import { evaluateRunIntegrity } from "../../domain/delay-analysis/xer/XerRunIntegrity";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  uploadId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
});

function publicUpload(upload: any) {
  return {
    id: upload.id,
    projectId: upload.projectId,
    filename: upload.filename,
    contentType: upload.contentType,
    detectedVersion: upload.detectedVersion,
    parseError: upload.parseError,
    createdAt: upload.createdAt,
    runs: upload.runs?.map(publicRun),
  };
}

function publicRun(run: any) {
  const hasOutput = run.hasOutput ?? Boolean(run.outputData);
  const integrityStatus = evaluateRunIntegrity({
    outcome: run.outcome,
    hasOutput,
    originalSha256: run.originalSha256,
    outputSha256: run.outputSha256,
  });
  if (integrityStatus === "incomplete_record" || integrityStatus === "hash_mismatch") {
    // A "clean" (byte-identical) outcome is a pass claim. If the evidence
    // for that claim is missing or self-contradictory, that's a
    // data-integrity problem worth surfacing in server logs, not something
    // to quietly paper over — the UI is told via integrityStatus and must
    // never render a pass badge for it.
    console.error(
      `XER run ${run.id} (upload ${run.uploadId}) has outcome "clean" but integrityStatus="${integrityStatus}"`,
      { hasOutput, originalSha256: run.originalSha256, outputSha256: run.outputSha256 },
    );
  }
  return {
    id: run.id,
    uploadId: run.uploadId,
    projectId: run.projectId,
    outcome: run.outcome,
    integrityStatus,
    detectedVersion: run.detectedVersion,
    diffReport: run.diffReport,
    errorMessage: run.errorMessage,
    originalSha256: run.originalSha256,
    outputSha256: run.outputSha256,
    structuralSummary: run.structuralSummary,
    createdAt: run.createdAt,
    hasOutput,
  };
}

export class XerRoundTripController {
  constructor(private readonly service: XerRoundTripService) {}

  async upload(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      if (!req.file) {
        res.status(400).json({ error: "No XER file uploaded" });
        return;
      }
      const upload = await this.service.upload(params.projectId, (req as any).tenantId ?? "default", {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        buffer: req.file.buffer,
      });
      res.status(201).json(publicUpload(upload));
    } catch (error) {
      this.respondError(res, error, "Failed to upload XER");
    }
  }

  async list(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      const uploads = await this.service.list(params.projectId, (req as any).tenantId ?? "default");
      res.json(uploads.map(publicUpload));
    } catch (error) {
      this.respondError(res, error, "Failed to list XER uploads");
    }
  }

  async run(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      const run = await this.service.run(params.uploadId!, params.projectId, (req as any).tenantId ?? "default");
      res.status(201).json(publicRun(run));
    } catch (error) {
      this.respondError(res, error, "Failed to run XER null test");
    }
  }

  async getRun(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      const run = await this.service.getRun(params.uploadId!, params.runId!, params.projectId, (req as any).tenantId ?? "default");
      if (!run) {
        res.status(404).json({ error: "XER run not found" });
        return;
      }
      res.json(publicRun(run));
    } catch (error) {
      this.respondError(res, error, "Failed to get XER run");
    }
  }

  async download(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      const run = await this.service.getRun(params.uploadId!, params.runId!, params.projectId, (req as any).tenantId ?? "default");
      if (!run) {
        res.status(404).json({ error: "XER run not found" });
        return;
      }
      if (!run.outputData) {
        res.status(409).json({ error: run.errorMessage ?? "This run has no downloadable output" });
        return;
      }
      res.setHeader("Content-Type", "application/xer");
      res.setHeader("Content-Disposition", `attachment; filename="round-trip-${params.uploadId}.xer"`);
      res.send(run.outputData);
    } catch (error) {
      this.respondError(res, error, "Failed to download XER output");
    }
  }

  async verificationRecord(req: Request, res: Response): Promise<void> {
    try {
      const params = paramsSchema.parse(req.params);
      const record = await this.service.getVerificationRecord(
        params.uploadId!,
        params.runId!,
        params.projectId,
        (req as any).tenantId ?? "default",
      );
      if (!record) {
        res.status(404).json({ error: "XER run not found" });
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="xer-verification-${params.runId}.json"`,
      );
      res.json({
        recordType: "xer-round-trip-verification-record",
        generatedAt: new Date().toISOString(),
        ...record,
      });
    } catch (error) {
      this.respondError(res, error, "Failed to build XER verification record");
    }
  }

  private respondError(res: Response, error: unknown, fallback: string): void {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request parameters" });
    } else if (error instanceof CompletedProjectRequiredError) {
      res.status(403).json({ error: error.message });
    } else if (error instanceof Error && /not found/i.test(error.message)) {
      res.status(404).json({ error: error.message });
    } else if (error instanceof Error && /Only non-empty|No XER|recognized Primavera/i.test(error.message)) {
      res.status(400).json({ error: error.message });
    } else {
      console.error(fallback, error);
      res.status(500).json({ error: fallback });
    }
  }
}
