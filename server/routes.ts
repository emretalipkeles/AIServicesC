import type { Express } from "express";
import type { Server } from "http";
import { registerRoutes as registerAllRoutes } from "./src/presentation/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  return registerAllRoutes(httpServer, app);
}
