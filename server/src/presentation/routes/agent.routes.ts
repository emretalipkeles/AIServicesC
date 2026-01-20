import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import multer from "multer";
import { AgentController } from "../controllers/AgentController";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/zip',
      'application/x-zip-compressed',
    ];
    const allowedExtensions = ['.txt', '.md', '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.zip'];
    
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const isValidMime = allowedMimeTypes.includes(file.mimetype);
    const isValidExt = allowedExtensions.includes(ext);
    
    if (isValidMime || isValidExt) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype} (${ext})`));
    }
  },
});

export function registerAgentRoutes(app: Express, container: AppContainer): void {
  const agentController = new AgentController(
    container.commandBus,
    container.queryBus,
    container.handlers.streamChatWithAgentHandler
  );

  app.get("/api/agents", (req, res) => agentController.listAgents(req, res));
  app.get("/api/agents/:id", (req, res) => agentController.getAgent(req, res));
  app.post("/api/agents", (req, res) => agentController.createAgent(req, res));
  app.put("/api/agents/:id", (req, res) => agentController.updateAgent(req, res));
  app.patch("/api/agents/:id", (req, res) => agentController.updateAgent(req, res));
  app.delete("/api/agents/:id", (req, res) => agentController.deleteAgent(req, res));
  app.get("/api/agents/:id/documents", (req, res) => agentController.listDocuments(req, res));
  app.post("/api/agents/:id/documents", (req, res) => agentController.uploadDocument(req, res));
  app.post("/api/agents/:id/documents/upload", (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ error: err.message || 'File upload failed' });
      }
      agentController.uploadDocumentFile(req, res);
    });
  });
  app.delete("/api/agents/:id/documents/:docId", (req, res) => agentController.deleteDocument(req, res));
  app.post("/api/agents/:id/reindex", (req, res) => agentController.reindexAgent(req, res));
  app.post("/api/agents/:id/chat", (req, res) => agentController.chatWithAgent(req, res));
  app.post("/api/agents/:id/chat/stream", (req, res) => agentController.streamChatWithAgent(req, res));
}
