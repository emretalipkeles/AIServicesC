import type { Express } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { OrchestratorController } from '../controllers/OrchestratorController';

export function registerOrchestratorRoutes(app: Express, container: AppContainer): void {
  if (!container.handlers.orchestrateHandler || !container.services.conversationSummarizer) {
    console.warn('[OrchestratorRoutes] AI client not configured, orchestration will not work');
    return;
  }
  
  const controller = new OrchestratorController(
    container.handlers.orchestrateHandler,
    container.repositories.conversation,
    container.services.conversationSummarizer,
    container.repositories.sessionMemory,
    container.handlers.updateConversationContextHandler,
    container.handlers.narrateUploadResultHandler
  );

  app.post('/api/ai/orchestrate/stream', (req, res) => {
    controller.streamOrchestrate(req, res);
  });

  app.post('/api/ai/orchestrate/upload-result', (req, res) => {
    controller.handleUploadResult(req, res);
  });
}
