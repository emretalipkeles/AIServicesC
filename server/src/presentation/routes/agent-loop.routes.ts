import type { Express, Request, Response } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import type { AgentLoopEvent } from '../../domain/delay-analysis/interfaces/IAgentLoop';
import { z } from 'zod';

const agentLoopBodySchema = z.object({
  projectId: z.string().uuid('Invalid project ID'),
  message: z.string().min(1, 'Message is required').max(4000, 'Message too long'),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })).optional().default([]),
});

const DEFAULT_TENANT_ID = 'default';

function mapAgentLoopEventToSSE(event: AgentLoopEvent): object {
  switch (event.type) {
    case 'loop_started':
      return { type: 'thinking', message: event.message };
    case 'thinking':
      return { type: 'thinking', message: event.message, iteration: event.iterationCount };
    case 'tool_invocation':
      return { type: 'tool_invocation', toolName: event.toolName, toolArgs: event.toolArgs, message: event.message };
    case 'tool_result':
      return { type: 'tool_result', toolName: event.toolName, success: !event.toolError, error: event.toolError };
    case 'response_chunk':
      return { type: 'content', content: event.content };
    case 'response_complete':
      return { type: 'done', toolsUsed: event.toolsUsed, iterationCount: event.iterationCount };
    case 'loop_completed':
      return { type: 'loop_completed', toolsUsed: event.toolsUsed, iterationCount: event.iterationCount };
    case 'loop_failed':
      return { type: 'error', message: event.error };
    default:
      return { type: event.type, message: event.message };
  }
}

export function registerAgentLoopRoutes(app: Express, container: AppContainer): void {
  app.post(
    '/api/ai/agent-loop/stream',
    async (req: Request, res: Response) => {
      try {
        const body = agentLoopBodySchema.parse(req.body);

        if (!container.services.agentLoop) {
          res.status(503).json({
            success: false,
            error: 'Agent loop not available - set OPEN_AI_KEY to enable AI features',
          });
          return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        const sendEvent = (data: object) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const onEvent = (event: AgentLoopEvent) => {
          const sseEvent = mapAgentLoopEventToSSE(event);
          sendEvent(sseEvent);
        };

        const systemPrompt = container.services.agentLoopSystemPrompt || '';

        await container.services.agentLoop.run(
          {
            projectId: body.projectId,
            tenantId: DEFAULT_TENANT_ID,
            userMessage: body.message,
            conversationHistory: body.conversationHistory,
            systemPrompt,
          },
          onEvent
        );

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (error) {
        if (error instanceof z.ZodError) {
          if (!res.headersSent) {
            res.status(400).json({ success: false, error: 'Invalid request' });
          }
          return;
        }

        console.error('[AgentLoopStream] Error:', error);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Failed to process agent loop request' });
        } else {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Stream interrupted' })}\n\n`);
          res.end();
        }
      }
    }
  );
}
