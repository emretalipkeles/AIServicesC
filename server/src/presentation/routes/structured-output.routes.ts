import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import { SaveStructuredOutputCommand, StructuredOutputBlock } from "../../application/commands/SaveStructuredOutputCommand";
import type { SaveStructuredOutputResult } from "../../application/commands/handlers/SaveStructuredOutputCommandHandler";
import { SchemaRegistry } from "../../infrastructure/persistence/SchemaRegistry";
import { z } from "zod";

const saveOutputSchema = z.object({
  blocks: z.array(z.object({
    tableName: z.string().min(1),
    data: z.record(z.unknown()),
  })).min(1),
});

export function registerStructuredOutputRoutes(app: Express, container: AppContainer): void {
  app.post("/api/agents/:agentId/save-output", async (req, res) => {
    try {
      const { agentId } = req.params;
      const tenantId = (req as any).tenantId ?? 'default';

      const parseResult = saveOutputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: "Invalid request body",
          details: parseResult.error.errors,
        });
      }

      const { blocks } = parseResult.data;

      const command = new SaveStructuredOutputCommand(
        tenantId,
        agentId,
        blocks as StructuredOutputBlock[]
      );

      const result = await container.commandBus.execute<SaveStructuredOutputCommand, SaveStructuredOutputResult>(command);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          errors: result.errors,
        });
      }

      return res.json({
        success: true,
        savedIds: result.savedIds,
      });
    } catch (error) {
      console.error("Error saving structured output:", error);
      return res.status(500).json({
        error: "Failed to save structured output",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/schema-registry/tables", async (_req, res) => {
    try {
      const tables = SchemaRegistry.getRegisteredTableNames();
      const tableInfo = tables.map(name => ({
        name,
        columns: SchemaRegistry.getColumnNames(name),
      }));
      return res.json({ tables: tableInfo });
    } catch (error) {
      console.error("Error fetching schema registry:", error);
      return res.status(500).json({ error: "Failed to fetch table registry" });
    }
  });
}
