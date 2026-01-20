import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import { AIController } from "../controllers/AIController";

export function registerAIRoutes(app: Express, container: AppContainer): void {
  const aiController = new AIController(
    container.commandBus,
    container.queryBus,
    container.services.isAIConfigured,
    container.handlers.streamChatHandler
  );
  
  app.get("/api/ai/status", (req, res) => aiController.getStatus(req, res));
  app.post("/api/ai/test-connection", (req, res) => aiController.testConnection(req, res));
  app.post("/api/ai/chat", (req, res) => aiController.chat(req, res));
  app.post("/api/ai/chat/stream", (req, res) => aiController.streamChat(req, res));
}
