import type { Express } from "express";
import { storage } from "../../../storage";
import { insertClientSchema } from "@shared/schema";

export function registerClientRoutes(app: Express): void {
  app.get("/api/clients", async (_req, res) => {
    const clients = await storage.getClients();
    res.json(clients);
  });

  app.get("/api/clients/:id", async (req, res) => {
    const client = await storage.getClient(req.params.id);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    res.json(client);
  });

  app.post("/api/clients", async (req, res) => {
    const parsed = insertClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    const client = await storage.createClient(parsed.data);
    res.status(201).json(client);
  });
}
