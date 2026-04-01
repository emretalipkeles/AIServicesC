import type { Express } from "express";
import type { Server } from "http";
import { getAppContainer } from "../../infrastructure/bootstrap";
import { registerClientRoutes } from "./client.routes";
import { registerJourneyRoutes } from "./journey.routes";
import { registerChatRoutes } from "./chat.routes";
import { registerStatsRoutes } from "./stats.routes";
import { registerAgentRoutes } from "./agent.routes";
import { registerStructuredOutputRoutes } from "./structured-output.routes";
import { registerDelayAnalysisProjectRoutes } from "./delay-analysis-project.routes";
import { registerProjectDocumentRoutes } from "./project-document.routes";
import { registerScheduleActivityRoutes } from "./schedule-activity.routes";
import { registerAnalysisRoutes } from "./analysis.routes";
import { registerAgentLoopRoutes } from "./agent-loop.routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const container = getAppContainer();
  
  registerClientRoutes(app);
  registerJourneyRoutes(app);
  registerChatRoutes(app);
  registerStatsRoutes(app);
  registerAgentRoutes(app, container);
  registerStructuredOutputRoutes(app, container);
  registerDelayAnalysisProjectRoutes(app, container);
  registerProjectDocumentRoutes(app, container);
  registerScheduleActivityRoutes(app, container);
  registerAnalysisRoutes(app, container);
  registerAgentLoopRoutes(app, container);

  return httpServer;
}
