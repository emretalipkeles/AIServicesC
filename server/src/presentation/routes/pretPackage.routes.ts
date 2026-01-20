import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import multer from "multer";
import { PretPackageController } from "../controllers/PretPackageController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'application/zip',
      'application/x-zip-compressed',
    ];
    const allowedExtensions = ['.zip'];
    
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const isValidMime = allowedMimeTypes.includes(file.mimetype);
    const isValidExt = allowedExtensions.includes(ext);
    
    if (isValidMime || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Only ZIP files are allowed.`));
    }
  },
});

export function registerPretPackageRoutes(app: Express, container: AppContainer): void {
  if (!container.handlers.importPretPackageHandler || !container.handlers.getPretPackageHandler || !container.handlers.analyzePackageHandler) {
    console.log("PRET Package handlers not available - skipping route registration");
    return;
  }

  const controller = new PretPackageController(
    container.handlers.importPretPackageHandler,
    container.handlers.getPretPackageHandler,
    container.handlers.analyzePackageHandler,
    container.handlers.getDimensionMembersHandler ?? undefined,
    container.handlers.streamNarratorHandler ?? undefined,
    container.services.packageAnalysisCache,
    container.services.pretCommandRegistry
  );

  app.get("/api/pret/packages", (req, res) => controller.listPackages(req, res));
  
  app.get("/api/pret/packages/:packageId", (req, res) => controller.getPackage(req, res));
  
  app.get("/api/pret/packages/:packageId/contents", (req, res) => controller.getPackageContents(req, res));
  
  app.get("/api/pret/packages/:packageId/analyze", (req, res) => controller.analyzePackage(req, res));
  
  app.get("/api/pret/packages/:packageId/dimension-members", (req, res) => controller.getDimensionMembers(req, res));
  
  app.get("/api/pret/packages/:packageId/download", (req, res) => controller.downloadPackage(req, res));
  
  app.post("/api/pret/packages/:packageId/narrate/stream", (req, res) => controller.streamNarration(req, res));
  
  app.post("/api/pret/packages/:packageId/dimensions", (req, res) => controller.createDimension(req, res));
  
  app.post("/api/pret/packages/upload", (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
        }
        return res.status(400).json({ error: err.message || 'File upload failed' });
      }
      controller.importPackage(req, res);
    });
  });
}
