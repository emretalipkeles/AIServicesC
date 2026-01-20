import type { Request, Response } from 'express';
import type { ICommandBus } from '../../application/interfaces/ICommandBus';
import type { IQueryBus } from '../../application/interfaces/IQueryBus';
import type { ChatResponseDto, TestConnectionResponseDto } from '../../application/dto/AIDto';
import { SendChatCommand } from '../../application/commands/SendChatCommand';
import { StreamChatCommand } from '../../application/commands/StreamChatCommand';
import { TestConnectionQuery } from '../../application/queries/TestConnectionQuery';
import { chatRequestSchema, testConnectionRequestSchema } from '../validators/aiValidators';
import { ValidationError } from '../../domain/errors/DomainError';
import { SUPPORTED_MODELS, type ModelName } from '../../domain/value-objects/ModelId';
import type { StreamChatCommandHandler } from '../../application/commands/handlers/StreamChatCommandHandler';

export class AIController {
  constructor(
    private readonly commandBus: ICommandBus,
    private readonly queryBus: IQueryBus,
    private readonly isConfigured: boolean = false,
    private readonly streamHandler?: StreamChatCommandHandler
  ) {}

  async chat(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = chatRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
        return;
      }

      const { model, messages, maxTokens, temperature, systemPrompt } = parseResult.data;
      const tenantId = (req as any).tenantId;

      const command = new SendChatCommand(
        model as ModelName,
        messages,
        maxTokens,
        temperature,
        systemPrompt,
        tenantId
      );

      const response = await this.commandBus.execute<typeof command, ChatResponseDto>(command);
      res.json(response);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async streamChat(req: Request, res: Response): Promise<void> {
    let isClientConnected = true;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    let abortController: AbortController | null = null;
    let streamStarted = false;

    // Use res.on('close') instead of req.on('close') for SSE connections
    // req.on('close') fires when request body is received, not when SSE connection closes
    res.on('close', () => {
      console.log('[AIController] Response connection closed, streamStarted:', streamStarted);
      isClientConnected = false;
      // Only abort if the stream has actually started
      if (streamStarted && abortController) {
        abortController.abort();
      }
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    });

    try {
      if (!this.streamHandler) {
        res.status(503).json({ error: 'Streaming not configured' });
        return;
      }

      const parseResult = chatRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
        return;
      }

      const { model, messages, maxTokens, temperature, systemPrompt } = parseResult.data;
      const tenantId = (req as any).tenantId;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Write initial comment to keep connection alive
      res.write(':connected\n\n');
      console.log('[AIController] SSE headers flushed and initial comment sent');

      heartbeatInterval = setInterval(() => {
        if (isClientConnected) {
          res.write(':ping\n\n');
        }
      }, 15000);

      const command = new StreamChatCommand(
        model as ModelName,
        messages,
        maxTokens,
        temperature,
        systemPrompt,
        tenantId
      );

      // Create abort controller just before streaming starts
      abortController = new AbortController();
      streamStarted = true;
      console.log('[AIController] Starting stream handler...');

      await this.streamHandler.handleStream(
        command,
        (chunk) => {
          if (!isClientConnected) return;
          
          if (chunk.type === 'content' && chunk.content) {
            res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`);
          } else if (chunk.type === 'done') {
            res.write(`data: ${JSON.stringify({ type: 'done', inputTokens: chunk.inputTokens, outputTokens: chunk.outputTokens })}\n\n`);
          } else if (chunk.type === 'error') {
            res.write(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`);
          }
        },
        { abortSignal: abortController.signal }
      );

      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      res.end();
    } catch (error) {
      console.error('Stream chat error:', error);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (!res.headersSent) {
        this.handleError(res, error);
      } else if (isClientConnected) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`);
        res.end();
      }
    }
  }

  async testConnection(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = testConnectionRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        res.status(400).json({ 
          error: 'Validation failed',
          details: parseResult.error.errors,
        });
        return;
      }

      const tenantId = (req as any).tenantId;
      const model = (parseResult.data?.model ?? 'claude-sonnet-4-5') as ModelName;
      
      const query = new TestConnectionQuery(model, tenantId);
      const response = await this.queryBus.execute<typeof query, TestConnectionResponseDto>(query);
      
      if (response.success) {
        res.json(response);
      } else {
        res.status(503).json(response);
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getStatus(_req: Request, res: Response): Promise<void> {
    try {
      const models = Object.keys(SUPPORTED_MODELS);
      res.json({
        configured: this.isConfigured,
        availableModels: models,
      });
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown): void {
    console.error('AI Controller error:', error);

    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (error instanceof Error) {
      if (error.message.includes('not configured') || error.message.includes('No handler registered')) {
        res.status(503).json({ 
          error: 'AI service not configured',
          details: error.message,
        });
        return;
      }

      res.status(500).json({ 
        error: 'Internal server error',
        details: error.message,
      });
      return;
    }

    res.status(500).json({ error: 'Unknown error occurred' });
  }
}
