import type { Express } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { AnalysisController } from '../controllers/AnalysisController';
import { RunAnalysisCommandHandler } from '../../application/delay-analysis/commands/handlers/RunAnalysisCommandHandler';
import { ListDelayEventsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListDelayEventsQueryHandler';

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
    (req, res) => {
      const controller = new AnalysisController(null, listEventsHandler);
      controller.listDelayEvents(req, res);
    }
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/export',
    (req, res) => {
      const controller = new AnalysisController(null, listEventsHandler);
      controller.exportToCsv(req, res);
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

  const runAnalysisHandler = new RunAnalysisCommandHandler(
    container.repositories.delayAnalysisProject,
    container.repositories.projectDocument,
    container.repositories.scheduleActivity,
    container.repositories.contractorDelayEvent,
    container.services.delayEventExtractor!,
    container.services.activityMatcher!
  );

  const controller = new AnalysisController(runAnalysisHandler, listEventsHandler);

  app.post(
    '/api/delay-analysis/projects/:projectId/analyze',
    (req, res) => controller.runAnalysis(req, res)
  );

  app.get(
    '/api/delay-analysis/projects/:projectId/analyze/stream',
    (req, res) => controller.runAnalysisStream(req, res)
  );
}
