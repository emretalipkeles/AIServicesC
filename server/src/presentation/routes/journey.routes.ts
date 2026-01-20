import type { Express } from "express";
import { storage } from "../../../storage";
import { insertJourneySchema } from "@shared/schema";
import { updateJourneyProgressSchema } from "../validators/journeyValidators";

export function registerJourneyRoutes(app: Express): void {
  app.get("/api/journeys", async (_req, res) => {
    const journeys = await storage.getJourneys();
    res.json(journeys);
  });

  app.get("/api/journeys/:id", async (req, res) => {
    const journey = await storage.getJourney(req.params.id);
    if (!journey) {
      return res.status(404).json({ error: "Journey not found" });
    }
    res.json(journey);
  });

  app.get("/api/clients/:clientId/journeys", async (req, res) => {
    const journeys = await storage.getJourneysByClientId(req.params.clientId);
    res.json(journeys);
  });

  app.post("/api/journeys", async (req, res) => {
    const parsed = insertJourneySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors });
    }
    const journey = await storage.createJourney(parsed.data);
    res.status(201).json(journey);
  });

  app.patch("/api/journeys/:id/progress", async (req, res) => {
    const parseResult = updateJourneyProgressSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
    }
    const { progress, status } = parseResult.data;
    const journey = await storage.updateJourneyProgress(req.params.id, progress, status);
    if (!journey) {
      return res.status(404).json({ error: "Journey not found" });
    }
    res.json(journey);
  });
}
