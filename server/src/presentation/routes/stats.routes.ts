import type { Express } from "express";
import { storage } from "../../../storage";

export function registerStatsRoutes(app: Express): void {
  app.get("/api/stats", async (_req, res) => {
    const journeys = await storage.getJourneys();
    const clients = await storage.getClients();
    
    const activeJourneys = journeys.filter(j => j.status === "in_progress").length;
    const completedJourneys = journeys.filter(j => j.status === "completed").length;
    
    const avgProgress = journeys.length > 0
      ? journeys.reduce((sum, j) => sum + j.progress, 0) / journeys.length
      : 0;
    
    res.json({
      activeJourneys,
      completedJourneys,
      totalClients: clients.length,
      averageProgress: Math.round(avgProgress),
    });
  });
}
