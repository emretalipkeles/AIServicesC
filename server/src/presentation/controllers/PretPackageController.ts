import type { Request, Response } from "express";
import type { ImportPretPackageHandler } from "../../application/pret/handlers/ImportPretPackageHandler";
import type { GetPretPackageHandler } from "../../application/pret/handlers/GetPretPackageHandler";
import type { AnalyzePackageHandler } from "../../application/pret/handlers/AnalyzePackageHandler";
import type { GetDimensionMembersHandler } from "../../application/pret/handlers/GetDimensionMembersHandler";
import type { StreamNarrateUploadResultHandler } from "../../application/orchestration/handlers/StreamNarrateUploadResultHandler";
import type { PackageAnalysisDto } from "../../application/pret/dto/PackageAnalysisDto";
import type { PackageAnalysisData, DimensionInfo, CubeInfo, IPackageAnalysisCache, IPretCommandRegistry, CreateOtherDimensionArgs } from "../../domain/pret";
import { ImportPretPackageCommand } from "../../application/pret/commands/ImportPretPackageCommand";
import { GetPretPackageQuery, ListPretPackagesQuery, DownloadPackageQuery } from "../../application/pret/queries/GetPretPackageQuery";
import { AnalyzePackageCommand } from "../../application/pret/commands/AnalyzePackageCommand";
import { GetDimensionMembersQuery } from "../../application/pret/queries/GetDimensionMembersQuery";
import { StreamNarrateUploadResultCommand } from "../../application/orchestration/commands/StreamNarrateUploadResultCommand";
import { createOtherDimensionRequestSchema } from "../validators/dimensionValidators";

export class PretPackageController {
  constructor(
    private readonly importHandler: ImportPretPackageHandler,
    private readonly getHandler: GetPretPackageHandler,
    private readonly analyzeHandler: AnalyzePackageHandler,
    private readonly getDimensionMembersHandler?: GetDimensionMembersHandler,
    private readonly streamNarratorHandler?: StreamNarrateUploadResultHandler,
    private readonly packageAnalysisCache?: IPackageAnalysisCache,
    private readonly pretCommandRegistry?: IPretCommandRegistry
  ) {}

  async importPackage(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const tenantId = (req as any).tenantId || "default";
      const packageId = `pkg_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const command = ImportPretPackageCommand.create(
        tenantId,
        packageId,
        file.buffer,
        file.originalname
      );

      const result = await this.importHandler.handle(command);

      if (result.success) {
        if (this.packageAnalysisCache) {
          try {
            const analyzeCommand = AnalyzePackageCommand.create(tenantId, packageId);
            const analysisResult = await this.analyzeHandler.handle(analyzeCommand);
            this.packageAnalysisCache.set(packageId, this.convertToPackageAnalysisData(analysisResult, tenantId));
            this.packageAnalysisCache.setDto(packageId, analysisResult);
            console.log('[PretPackageController] Auto-analyzed and cached package:', packageId, 
              `(${analysisResult.dimensions.length} dimensions, ${analysisResult.models.length} models)`);
          } catch (analyzeError) {
            console.warn('[PretPackageController] Auto-analysis failed for package:', packageId, analyzeError);
          }
        }
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error importing package:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to import package" 
      });
    }
  }

  async getPackage(req: Request, res: Response): Promise<void> {
    try {
      const { packageId } = req.params;
      const tenantId = (req as any).tenantId || "default";

      const query = GetPretPackageQuery.create(tenantId, packageId);
      const result = await this.getHandler.handle(query);

      if (result) {
        res.json({ success: true, session: result });
      } else {
        res.status(404).json({ success: false, error: "Package not found" });
      }
    } catch (error) {
      console.error("Error getting package:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to get package" 
      });
    }
  }

  async listPackages(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId || "default";

      const query = ListPretPackagesQuery.create(tenantId);
      const result = await this.getHandler.handleList(query);

      res.json(result);
    } catch (error) {
      console.error("Error listing packages:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to list packages" 
      });
    }
  }

  async getPackageContents(req: Request, res: Response): Promise<void> {
    try {
      const { packageId } = req.params;
      const tenantId = (req as any).tenantId || "default";

      const query = GetPretPackageQuery.create(tenantId, packageId);
      const result = await this.getHandler.getPackageContents(query);

      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: "Package not found or not ready" });
      }
    } catch (error) {
      console.error("Error getting package contents:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get package contents" 
      });
    }
  }

  async analyzePackage(req: Request, res: Response): Promise<void> {
    try {
      const { packageId } = req.params;
      const tenantId = (req as any).tenantId || "default";
      const forceRefresh = req.query.refresh === 'true';

      // Check DTO cache first unless forced refresh requested
      if (!forceRefresh && this.packageAnalysisCache) {
        const cachedDto = this.packageAnalysisCache.getDto<PackageAnalysisDto>(packageId);
        if (cachedDto) {
          console.log(`[PretPackageController] Returning cached DTO analysis for package: ${packageId}`);
          res.json(cachedDto);
          return;
        }
      }

      const command = AnalyzePackageCommand.create(tenantId, packageId);
      const result = await this.analyzeHandler.handle(command);

      if (this.packageAnalysisCache) {
        // Store both the lightweight data (for agents) and full DTO (for API responses)
        this.packageAnalysisCache.set(packageId, this.convertToPackageAnalysisData(result, tenantId));
        this.packageAnalysisCache.setDto(packageId, result);
      }

      res.json(result);
    } catch (error) {
      console.error("Error analyzing package:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to analyze package" 
      });
    }
  }

  async getDimensionMembers(req: Request, res: Response): Promise<void> {
    try {
      if (!this.getDimensionMembersHandler) {
        res.status(503).json({ error: "Dimension members handler not configured" });
        return;
      }

      const { packageId } = req.params;
      const dimensionPath = req.query.path as string;
      const tenantId = (req as any).tenantId || "default";

      if (!dimensionPath) {
        res.status(400).json({ error: "Missing required query parameter: path" });
        return;
      }

      const query = new GetDimensionMembersQuery(tenantId, packageId, dimensionPath);
      const result = await this.getDimensionMembersHandler.handle(query);

      res.json(result);
    } catch (error) {
      console.error("Error getting dimension members:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to get dimension members" 
      });
    }
  }

  async downloadPackage(req: Request, res: Response): Promise<void> {
    try {
      const { packageId } = req.params;
      const tenantId = (req as any).tenantId || "default";

      const query = DownloadPackageQuery.create(tenantId, packageId);
      const result = await this.getHandler.downloadPackage(query);

      if (!result) {
        res.status(404).json({ error: "Package not found or not ready" });
        return;
      }

      const safeFilename = result.packageName.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.zip"`);
      res.setHeader('Content-Length', result.buffer.length);
      res.send(result.buffer);
    } catch (error) {
      console.error("Error downloading package:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to download package" 
      });
    }
  }

  async streamNarration(req: Request, res: Response): Promise<void> {
    let isClientConnected = true;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let abortController: AbortController | null = null;
    let streamStarted = false;

    res.on('close', () => {
      isClientConnected = false;
      if (streamStarted && abortController) {
        abortController.abort();
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    });

    try {
      if (!this.streamNarratorHandler) {
        res.status(503).json({ error: 'Narrator streaming not configured' });
        return;
      }

      const { packageId } = req.params;
      const { success, packageName, error, validationErrors, conversationId } = req.body;
      const tenantId = (req as any).tenantId || "default";

      if (typeof success !== 'boolean' || !packageName) {
        res.status(400).json({ error: 'Missing required fields: success, packageName' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write(':connected\n\n');

      heartbeatInterval = setInterval(() => {
        if (isClientConnected) {
          res.write(':ping\n\n');
        }
      }, 15000);

      const command = StreamNarrateUploadResultCommand.create(
        tenantId,
        success,
        packageName,
        packageId,
        error,
        validationErrors,
        conversationId
      );

      abortController = new AbortController();
      streamStarted = true;

      let streamTone: string | undefined;

      const result = await this.streamNarratorHandler.handleStream(
        command,
        (chunk) => {
          if (!isClientConnected) return;

          if (chunk.type === 'content' && chunk.content) {
            res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`);
          } else if (chunk.type === 'done') {
            streamTone = chunk.tone;
          } else if (chunk.type === 'error') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`);
          }
        },
        { abortSignal: abortController.signal }
      );

      if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ type: 'done', tone: streamTone, conversationId: result.conversationId })}\n\n`);
      }

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      res.end();
    } catch (error) {
      console.error('Stream narration error:', error);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
      } else if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
        res.end();
      }
    }
  }

  async createDimension(req: Request, res: Response): Promise<void> {
    try {
      if (!this.pretCommandRegistry) {
        res.status(503).json({ error: "Dimension creation not configured" });
        return;
      }

      const { packageId } = req.params;
      const tenantId = (req as any).tenantId || "default";

      const parseResult = createOtherDimensionRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ 
          error: "Validation failed",
          details: parseResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      }

      const { modelName, dimensionName, dimensionKind, dimensionDescription } = parseResult.data;

      const handler = this.pretCommandRegistry.getHandler<CreateOtherDimensionArgs, unknown>('createOtherDimension');
      if (!handler) {
        res.status(503).json({ error: "CreateOtherDimension handler not available" });
        return;
      }

      const command = {
        type: 'createOtherDimension' as const,
        packageId,
        tenantId,
        args: {
          modelName,
          dimensionName,
          dimensionKind,
          dimensionDescription
        }
      };

      const result = await handler.handle(command);

      if (result.success) {
        // Note: When created via REST, CreateOtherDimensionCommandHandler already updates the cache.
        // This re-analysis is only done if we want to ensure the S3 ZIP is rebuilt for download.
        // Skip re-analysis here to preserve the cache that was already updated with the new dimension.
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error creating dimension:", error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Failed to create dimension" 
      });
    }
  }

  private convertToPackageAnalysisData(dto: PackageAnalysisDto, tenantId: string): PackageAnalysisData {
    const dimensions: DimensionInfo[] = [];
    const cubes: CubeInfo[] = [];

    for (const model of dto.models) {
      cubes.push({
        name: model.name,
        path: model.path,
        dimensions: model.dimensions.map(d => d.name),
      });

      for (const dim of model.dimensions) {
        dimensions.push({
          name: dim.name,
          kind: dim.kind,
          path: dim.path || '',
          modelName: model.name,
          memberCount: dim.accountCount,
        });
      }
    }

    for (const dim of dto.dimensions) {
      const existing = dimensions.find(d => d.name === dim.name && d.modelName === dim.modelName);
      if (!existing) {
        dimensions.push({
          name: dim.name,
          kind: 'Dimension',
          path: dim.path,
          modelName: dim.modelName,
          memberCount: dim.accountCount,
        });
      }
    }

    return {
      packageId: dto.packageId,
      packageName: dto.packageName,
      tenantId,
      dimensions,
      cubes,
    };
  }

}
