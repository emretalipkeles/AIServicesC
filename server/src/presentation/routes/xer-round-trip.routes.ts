import type { Express } from "express";
import multer from "multer";
import type { AppContainer } from "../../infrastructure/bootstrap";
import { XerRoundTripController } from "../controllers/XerRoundTripController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf("."));
    if (extension !== ".xer") {
      callback(new Error("Only Primavera .xer files are allowed"));
      return;
    }
    callback(null, true);
  },
});

export function registerXerRoundTripRoutes(app: Express, container: AppContainer): void {
  const controller = new XerRoundTripController(container.xer.roundTripService);
  app.post("/api/delay-analysis/projects/:projectId/xer", (req, res) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        const status = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        res.status(status).json({ error: error.message });
        return;
      }
      void controller.upload(req, res);
    });
  });
  app.get("/api/delay-analysis/projects/:projectId/xer", (req, res) => controller.list(req, res));
  app.post("/api/delay-analysis/projects/:projectId/xer/:uploadId/runs", (req, res) => controller.run(req, res));
  app.get("/api/delay-analysis/projects/:projectId/xer/:uploadId/runs/:runId", (req, res) => controller.getRun(req, res));
  app.get("/api/delay-analysis/projects/:projectId/xer/:uploadId/runs/:runId/download", (req, res) => controller.download(req, res));
  app.get("/api/delay-analysis/projects/:projectId/xer/:uploadId/runs/:runId/verification", (req, res) => controller.verificationRecord(req, res));
}