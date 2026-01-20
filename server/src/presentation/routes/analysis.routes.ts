import type { Express, Request, Response } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { RunAnalysisCommandHandler } from '../../application/delay-analysis/commands/handlers/RunAnalysisCommandHandler';
import { ListDelayEventsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListDelayEventsQueryHandler';
import { RecordTokenUsageCommandHandler } from '../../application/delay-analysis/commands/handlers/RecordTokenUsageCommandHandler';
import { SSEProgressReporter } from '../../infrastructure/document-parsing/SSEProgressReporter';
import type { TokenUsageCallback } from '../../domain/delay-analysis/interfaces/ITokenUsageRecorder';
import { runAnalysisParamsSchema, runAnalysisBodySchema, listDelayEventsParamsSchema } from '../validators/analysisValidators';

const DEFAULT_TENANT_ID = 'default';

export function registerAnalysisRoutes(app: Express, container: AppContainer): void {
  const listEventsHandler = new ListDelayEventsQueryHandler(
    container.repositories.contractorDelayEvent
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

  app.get(
    '/api/delay-analysis/projects/:projectId/export',
    async (req: Request, res: Response) => {
      try {
        const params = listDelayEventsParamsSchema.parse(req.params);
        const events = await listEventsHandler.execute({
          projectId: params.projectId,
          tenantId: DEFAULT_TENANT_ID,
        });

        const headers = [
          'WBS', 'Activity ID', 'Activity Description', 'Event Description',
          'Event Category', 'Event Date', 'Duration (Hours)', 'Source Reference',
          'Confidence (%)', 'Match Reasoning', 'Status',
        ];

        const rows = events.map(event => [
          event.wbs || '',
          event.cpmActivityId || '',
          event.cpmActivityDescription || '',
          `"${event.eventDescription.replace(/"/g, '""')}"`,
          event.eventCategory || '',
          event.eventStartDate ? new Date(event.eventStartDate).toISOString().split('T')[0] : '',
          event.impactDurationHours?.toString() || '',
          event.sourceReference || '',
          event.matchConfidence?.toString() || '',
          event.matchReasoning ? `"${event.matchReasoning.replace(/"/g, '""')}"` : '',
          event.verificationStatus,
        ]);

        const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="delay-analysis-${params.projectId}.csv"`);
        res.send(csv);
      } catch (error) {
        if (error instanceof Error && error.name === 'ZodError') {
          res.status(400).json({ success: false, error: 'Invalid request parameters' });
          return;
        }

        console.error('Error exporting to CSV:', error);
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
    container.services.activityMatcher!
  );

  const createTokenCallback = (projectId: string): TokenUsageCallback => {
    return async (usage) => {
      try {
        await tokenUsageHandler.handle({
          type: 'RecordTokenUsageCommand',
          projectId,
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

        const result = await runAnalysisHandler.execute(
          {
            projectId: params.projectId,
            tenantId: DEFAULT_TENANT_ID,
            extractFromDocuments: body.extractFromDocuments,
            matchToActivities: body.matchToActivities,
          },
          { onTokenUsage: createTokenCallback(params.projectId) }
        );

        res.json({
          success: true,
          data: {
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

        const extractFromDocuments = req.query.extractFromDocuments !== 'false';
        const matchToActivities = req.query.matchToActivities !== 'false';

        await runAnalysisHandler.execute(
          {
            projectId: params.projectId,
            tenantId: DEFAULT_TENANT_ID,
            extractFromDocuments,
            matchToActivities,
          },
          {
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
}
