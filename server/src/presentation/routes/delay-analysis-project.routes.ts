import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import { DelayAnalysisProjectController } from "../controllers/DelayAnalysisProjectController";

export function registerDelayAnalysisProjectRoutes(app: Express, container: AppContainer): void {
  const controller = new DelayAnalysisProjectController(
    container.commandBus,
    container.queryBus
  );

  app.get("/api/delay-analysis/projects", (req, res) => controller.listProjects(req, res));
  app.get("/api/delay-analysis/projects/:id", (req, res) => controller.getProject(req, res));
  app.post("/api/delay-analysis/projects", (req, res) => controller.createProject(req, res));
  app.put("/api/delay-analysis/projects/:id", (req, res) => controller.updateProject(req, res));
  app.patch("/api/delay-analysis/projects/:id", (req, res) => controller.updateProject(req, res));
  app.delete("/api/delay-analysis/projects/:id", (req, res) => controller.deleteProject(req, res));
}
