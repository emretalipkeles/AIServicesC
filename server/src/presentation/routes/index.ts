import type { Express } from "express";
import type { Server } from "http";
import { getAppContainer } from "../../infrastructure/bootstrap";
import { registerClientRoutes } from "./client.routes";
import { registerJourneyRoutes } from "./journey.routes";
import { registerChatRoutes } from "./chat.routes";
import { registerStatsRoutes } from "./stats.routes";
import { registerAIRoutes } from "./ai.routes";
import { registerAgentRoutes } from "./agent.routes";
import { registerOrchestratorRoutes } from "./orchestrator.routes";
import { registerStructuredOutputRoutes } from "./structured-output.routes";
import { registerPretPackageRoutes } from "./pretPackage.routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const container = getAppContainer();
  
  registerClientRoutes(app);
  registerJourneyRoutes(app);
  registerChatRoutes(app);
  registerStatsRoutes(app);
  registerAIRoutes(app, container);
  registerAgentRoutes(app, container);
  registerOrchestratorRoutes(app, container);
  registerStructuredOutputRoutes(app, container);
  registerPretPackageRoutes(app, container);

  return httpServer;
}
