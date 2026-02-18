import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { RunAnalysisCommandHandler } from '../../application/delay-analysis/commands/handlers/RunAnalysisCommandHandler';
import { RunSingleDocumentAnalysisCommandHandler } from '../../application/delay-analysis/commands/handlers/RunSingleDocumentAnalysisCommandHandler';
import { ListDelayEventsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListDelayEventsQueryHandler';
import { RecordTokenUsageCommandHandler } from '../../application/delay-analysis/commands/handlers/RecordTokenUsageCommandHandler';
import { GetTokenUsageByRunIdQuery } from '../../application/delay-analysis/queries/GetTokenUsageByRunIdQuery';
import { SSEProgressReporter } from '../../infrastructure/document-parsing/SSEProgressReporter';
import { GetAnalysisRunStatusQueryHandler } from '../../application/delay-analysis/queries/handlers/GetAnalysisRunStatusQueryHandler';
import type { TokenUsageCallback, TokenUsageRecord } from '../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { runAnalysisParamsSchema, runAnalysisBodySchema, runSingleDocAnalysisParamsSchema, listDelayEventsParamsSchema } from '../validators/analysisValidators';
import ExcelJS from 'exceljs';

const DEFAULT_TENANT_ID = 'default';

export function registerAnalysisRoutes(app: Express, container: AppContainer): void {
  const listEventsHandler = new ListDelayEventsQueryHandler(
    container.repositories.contractorDelayEvent,
    container.repositories.scheduleActivity
  );

  const hasAiServices = !!(container.services.delayEventExtractor && container.services.activityMatcher);

  app.get('/api/delay-analysis/analysis-capabilities', (_req, res) => {
    res.json({
      success: true,
      data: {
        analysisAvailable: hasAiServices,
        message: hasAiServices 
          ? 'AI analysis services are available' 
          : 'AI services not configured - set OPEN_AI_KEY to enable analysis',
      },
    });
  });

  app.get(
    '/api/delay-analysis/projects/:projectId/delay-events',
    async (req: Request, res: Response) => {
      try {
        const params = listDelayEventsParamsSchema.parse(req.params);
        const events = await listEventsHandler.execute({
          projectId: params.projectId,
          tenantId: DEFAULT_TENANT_ID,
        });
        res.json({ success: true, data: events, count: events.length });
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          res.status(400).json({ success: false, error: 'Invalid request parameters' });
          return;
        }

        console.error('Error listing delay events:', error);
        res.status(500).json({ success: false, error: 'Failed to list delay events' });
      }
    }
  );

  const runStatusHandler = new GetAnalysisRunStatusQueryHandler(
    container.services.analysisRunTracker
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/analysis/status',
    (req: Request, res: Response) => {
      try {
        const projectId = req.params.projectId;
        const status = runStatusHandler.execute({
          projectId,
          tenantId: DEFAULT_TENANT_ID,
        });

        res.json({
          success: true,
          data: status,
        });
      } catch (error) {
        console.error('Error checking analysis status:', error);
        res.status(500).json({ success: false, error: 'Failed to check analysis status' });
      }
    }
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/export',
    async (req: Request, res: Response) => {
      try {
        const params = listDelayEventsParamsSchema.parse(req.params);
        const events = await listEventsHandler.execute({
          projectId: params.projectId,
          tenantId: DEFAULT_TENANT_ID,
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Data First - Delay Analysis';
        workbook.created = new Date();

        const worksheet = workbook.addWorksheet('Delay Analysis Results', {
          views: [{ state: 'frozen', ySplit: 1 }],
        });

        worksheet.columns = [
          { header: 'WBS', key: 'wbs', width: 12 },
          { header: 'Activity ID', key: 'activityId', width: 15 },
          { header: 'Activity Description', key: 'activityDesc', width: 35 },
          { header: 'Critical Path', key: 'criticalPath', width: 12 },
          { header: 'Total Float', key: 'totalFloat', width: 12 },
          { header: 'Delay Event', key: 'eventDesc', width: 40 },
          { header: 'Category', key: 'category', width: 22 },
          { header: 'Date', key: 'date', width: 12 },
          { header: 'Duration (hrs)', key: 'duration', width: 14 },
          { header: 'Source Reference', key: 'sourceRef', width: 25 },
          { header: 'Confidence', key: 'confidence', width: 12 },
          { header: 'Match Reasoning', key: 'reasoning', width: 45 },
          { header: 'Status', key: 'status', width: 14 },
        ];

        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF3B82F6' },
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        headerRow.height = 28;

        headerRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF3B82F6' } },
            bottom: { style: 'medium', color: { argb: 'FF3B82F6' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });

        const categoryColors: Record<string, { bg: string; text: string }> = {
          'Weather': { bg: 'FFDBEAFE', text: 'FF1E40AF' },
          'Labor Related': { bg: 'FFFEE2E2', text: 'FFDC2626' },
          'Materials Equipment': { bg: 'FFFEF3C7', text: 'FFD97706' },
          'Site Management Safety': { bg: 'FFD1FAE5', text: 'FF059669' },
          'Utility Infrastructure': { bg: 'FFE0E7FF', text: 'FF4F46E5' },
          'Quality Rework': { bg: 'FFFCE7F3', text: 'FFDB2777' },
          'Planning Mobilization': { bg: 'FFDBEAFE', text: 'FF2563EB' },
          'Third Party': { bg: 'FFF3E8FF', text: 'FF9333EA' },
          'Owner Related': { bg: 'FFFCE7F3', text: 'FFEC4899' },
          'Subcontractor': { bg: 'FFCFFAFE', text: 'FF0891B2' },
        };

        const formatCriticalPath = (value: string | null): string => {
          if (!value || value === 'unknown') return '';
          if (value === 'yes') return 'Yes';
          if (value === 'no') return 'No';
          return value;
        };

        events.forEach((event, index) => {
          const rowData = {
            wbs: event.wbs || '',
            activityId: event.cpmActivityId || '',
            activityDesc: event.cpmActivityDescription || '',
            criticalPath: formatCriticalPath(event.isCriticalPath),
            totalFloat: event.totalFloat ?? null,
            eventDesc: event.eventDescription,
            category: event.eventCategory || '',
            date: event.eventStartDate ? new Date(event.eventStartDate) : null,
            duration: event.impactDurationHours || null,
            sourceRef: event.sourceReference || '',
            confidence: event.matchConfidence ? `${event.matchConfidence}%` : '',
            reasoning: event.matchReasoning || '',
            status: event.verificationStatus,
          };

          const row = worksheet.addRow(rowData);
          const isEvenRow = index % 2 === 0;

          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEvenRow ? 'FFFFFFFF' : 'FFF8FAFC' },
          };
          row.font = { color: { argb: 'FF1E293B' }, size: 10 };
          row.alignment = { vertical: 'middle', wrapText: true };
          row.height = 22;

          row.eachCell((cell, colNumber) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };

            if (colNumber === 7 && event.eventCategory) {
              const categoryKey = Object.keys(categoryColors).find(
                k => event.eventCategory?.toLowerCase().includes(k.toLowerCase().split(' ')[0])
              );
              if (categoryKey) {
                const colors = categoryColors[categoryKey];
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: colors.bg },
                };
                cell.font = { color: { argb: colors.text }, bold: true, size: 10 };
              }
            }

            if (colNumber === 11 && event.matchConfidence) {
              const conf = event.matchConfidence;
              if (conf >= 80) {
                cell.font = { color: { argb: 'FF16A34A' }, bold: true, size: 10 };
              } else if (conf >= 50) {
                cell.font = { color: { argb: 'FFD97706' }, bold: true, size: 10 };
              } else {
                cell.font = { color: { argb: 'FFDC2626' }, size: 10 };
              }
            }

            if (colNumber === 8 && event.eventStartDate) {
              cell.numFmt = 'mm/dd/yyyy';
            }
          });
        });

        worksheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: events.length + 1, column: 13 },
        };

        const buffer = await workbook.xlsx.writeBuffer();
        const bufferData = Buffer.from(buffer);

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const filename = `Delay-Analysis-Export-${dateStr}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', bufferData.length.toString());
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(bufferData);
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          res.status(400).json({ success: false, error: 'Invalid request parameters' });
          return;
        }

        console.error('Error exporting to Excel:', error);
        res.status(500).json({ success: false, error: 'Failed to export data' });
      }
    }
  );

  if (!hasAiServices) {
    console.warn('[Analysis Routes] AI services not configured - analysis endpoint will not be available');

    app.post(
      '/api/delay-analysis/projects/:projectId/analyze',
      (_req, res) => {
        res.status(503).json({
          success: false,
          error: 'AI analysis services are not configured. Please set OPEN_AI_KEY environment variable.',
        });
      }
    );
    return;
  }

  const tokenUsageHandler = new RecordTokenUsageCommandHandler(
    container.repositories.aiTokenUsage
  );

  const runAnalysisHandler = new RunAnalysisCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.repositories.scheduleActivity,
    container.repositories.contractorDelayEvent,
    container.services.delayEventExtractor!,
    container.services.activityMatcher!,
    container.services.delayEventDeduplicationService,
    container.services.idrMatchPolicy,
    container.services.analysisRunTracker
  );

  const createTokenCallback = (projectId: string): TokenUsageCallback => {
    return async (usage: TokenUsageRecord) => {
      try {
        await tokenUsageHandler.handle({
          type: 'RecordTokenUsageCommand',
          projectId,
          runId: usage.runId,
          operation: usage.operation,
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          metadata: usage.metadata,
        });
      } catch (error) {
        console.error('[TokenUsage] Failed to record token usage:', error);
      }
    };
  };

  app.post(
    '/api/delay-analysis/projects/:projectId/analyze',
    async (req: Request, res: Response) => {
      try {
        const params = runAnalysisParamsSchema.parse(req.params);
        const body = runAnalysisBodySchema.parse(req.body);
        const runId = randomUUID();

        console.log(`[Analysis] Starting analysis run: ${runId} for project: ${params.projectId}`);

        const result = await runAnalysisHandler.execute(
          {
            projectId: params.projectId,
            tenantId: DEFAULT_TENANT_ID,
            extractFromDocuments: body.extractFromDocuments,
            matchToActivities: body.matchToActivities,
          },
          { 
            runId,
            onTokenUsage: createTokenCallback(params.projectId) 
          }
        );

        res.json({
          success: true,
          data: {
            runId,
            eventsExtracted: result.eventsExtracted,
            eventsMatched: result.eventsMatched,
            documentsProcessed: result.documentsProcessed,
            warnings: result.errors.length > 0 ? result.errors : undefined,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          res.status(400).json({ success: false, error: 'Invalid request parameters' });
          return;
        }

        console.error('Error running analysis:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to run analysis',
        });
      }
    }
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/analyze/stream',
    async (req: Request, res: Response) => {
      try {
        const params = runAnalysisParamsSchema.parse(req.params);
        const progressReporter = new SSEProgressReporter(res);
        const runId = randomUUID();

        const extractFromDocuments = req.query.extractFromDocuments !== 'false';
        const matchToActivities = req.query.matchToActivities !== 'false';
        const filterMonth = req.query.filterMonth ? parseInt(req.query.filterMonth as string) : undefined;
        const filterYear = req.query.filterYear ? parseInt(req.query.filterYear as string) : undefined;

        console.log(`[Analysis] Starting streaming analysis run: ${runId} for project: ${params.projectId} (filter: ${filterMonth}/${filterYear})`);

        await runAnalysisHandler.execute(
          {
            projectId: params.projectId,
            tenantId: DEFAULT_TENANT_ID,
            extractFromDocuments,
            matchToActivities,
            filterMonth,
            filterYear,
          },
          {
            runId,
            progressReporter,
            onTokenUsage: createTokenCallback(params.projectId),
          }
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          const errorData = JSON.stringify({ type: 'error', message: 'Invalid request parameters' });
          res.write(`data: ${errorData}\n\n`);
          res.end();
          return;
        }

        console.error('Error in analysis stream:', error);
        const errorData = JSON.stringify({
          type: 'error',
          message: error instanceof Error ? error.message : 'Failed to run analysis',
        });
        res.write(`data: ${errorData}\n\n`);
        res.end();
      }
    }
  );

  const singleDocAnalysisHandler = new RunSingleDocumentAnalysisCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.repositories.scheduleActivity,
    container.repositories.contractorDelayEvent,
    container.services.delayEventExtractor!,
    container.services.activityMatcher!,
    container.services.idrMatchPolicy
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/documents/:documentId/analyze/stream',
    async (req: Request, res: Response) => {
      try {
        const params = runSingleDocAnalysisParamsSchema.parse(req.params);
        const progressReporter = new SSEProgressReporter(res);
        const runId = randomUUID();

        console.log(`[Analysis] Starting single-document analysis: ${runId} for document: ${params.documentId} in project: ${params.projectId}`);

        await singleDocAnalysisHandler.execute(
          {
            projectId: params.projectId,
            documentId: params.documentId,
            tenantId: DEFAULT_TENANT_ID,
          },
          {
            runId,
            progressReporter,
            onTokenUsage: createTokenCallback(params.projectId),
          }
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          const errorData = JSON.stringify({ type: 'error', message: 'Invalid request parameters' });
          res.write(`data: ${errorData}\n\n`);
          res.end();
          return;
        }

        console.error('Error in single-document analysis stream:', error);
        if (!res.headersSent) {
          const errorData = JSON.stringify({
            type: 'error',
            message: error instanceof Error ? error.message : 'Failed to run single-document analysis',
          });
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.write(`data: ${errorData}\n\n`);
          res.end();
        }
      }
    }
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/token-usage',
    async (req: Request, res: Response) => {
      try {
        const { projectId } = req.params;
        const summary = await container.repositories.aiTokenUsage.getProjectSummary(projectId);
        res.json({ success: true, data: summary });
      } catch (error) {
        console.error('[TokenUsage] Failed to get summary:', error);
        res.status(500).json({ success: false, error: 'Failed to get token usage' });
      }
    }
  );

  app.get(
    '/api/delay-analysis/runs/:runId/token-usage',
    async (req: Request, res: Response) => {
      try {
        const { runId } = req.params;
        const query = new GetTokenUsageByRunIdQuery(runId);
        const summary = await container.queryBus.execute(query);
        
        if (!summary) {
          res.status(404).json({ success: false, error: 'Run not found' });
          return;
        }
        
        res.json({ success: true, data: summary });
      } catch (error) {
        console.error('[TokenUsage] Failed to get run summary:', error);
        res.status(500).json({ success: false, error: 'Failed to get run token usage' });
      }
    }
  );

}
