import type { Express } from "express";
import { storage } from "../../../storage";
import { insertChatMessageSchema } from "@shared/schema";

export function registerChatRoutes(app: Express): void {
  app.get("/api/chat/messages", async (_req, res) => {
    const messages = await storage.getChatMessages();
    res.json(messages);
  });

  app.post("/api/chat/messages", async (req, res) => {
    const parsed = insertChatMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    const message = await storage.createChatMessage(parsed.data);
    res.status(201).json(message);
  });
}
