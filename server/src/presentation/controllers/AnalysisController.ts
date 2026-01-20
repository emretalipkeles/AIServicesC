import type { Request, Response } from 'express';
import type { RunAnalysisCommandHandler } from '../../application/delay-analysis/commands/handlers/RunAnalysisCommandHandler';
import type { ListDelayEventsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListDelayEventsQueryHandler';
import { SSEProgressReporter } from '../../infrastructure/document-parsing/SSEProgressReporter';
import {
  runAnalysisParamsSchema,
  runAnalysisBodySchema,
  listDelayEventsParamsSchema,
} from '../validators/analysisValidators';

const DEFAULT_TENANT_ID = 'default';

export class AnalysisController {
  constructor(
    private readonly runAnalysisHandler: RunAnalysisCommandHandler | null,
    private readonly listEventsHandler: ListDelayEventsQueryHandler
  ) {}

  async runAnalysis(req: Request, res: Response): Promise<void> {
    if (!this.runAnalysisHandler) {
      res.status(503).json({
        success: false,
        error: 'AI analysis services are not configured',
      });
      return;
    }

    try {
      const params = runAnalysisParamsSchema.parse(req.params);
      const body = runAnalysisBodySchema.parse(req.body);

      const result = await this.runAnalysisHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        extractFromDocuments: body.extractFromDocuments,
        matchToActivities: body.matchToActivities,
      });

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

  async runAnalysisStream(req: Request, res: Response): Promise<void> {
    if (!this.runAnalysisHandler) {
      res.status(503).json({
        success: false,
        error: 'AI analysis services are not configured',
      });
      return;
    }

    try {
      const params = runAnalysisParamsSchema.parse(req.params);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const progressReporter = new SSEProgressReporter(res);

      const extractFromDocuments = req.query.extractFromDocuments !== 'false';
      const matchToActivities = req.query.matchToActivities !== 'false';

      await this.runAnalysisHandler.execute(
        {
          projectId: params.projectId,
          tenantId: DEFAULT_TENANT_ID,
          extractFromDocuments,
          matchToActivities,
        },
        { progressReporter }
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

  async listDelayEvents(req: Request, res: Response): Promise<void> {
    try {
      const params = listDelayEventsParamsSchema.parse(req.params);

      const events = await this.listEventsHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
      });

      res.json({
        success: true,
        data: events,
        count: events.length,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        res.status(400).json({ success: false, error: 'Invalid request parameters' });
        return;
      }

      console.error('Error listing delay events:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list delay events',
      });
    }
  }

  async exportToCsv(req: Request, res: Response): Promise<void> {
    try {
      const params = listDelayEventsParamsSchema.parse(req.params);

      const events = await this.listEventsHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
      });

      const headers = [
        'WBS',
        'Activity ID',
        'Activity Description',
        'Event Description',
        'Event Category',
        'Event Date',
        'Duration (Hours)',
        'Source Reference',
        'Confidence (%)',
        'Match Reasoning',
        'Status',
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
      console.error('Error exporting to CSV:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to export data',
      });
    }
  }
}
