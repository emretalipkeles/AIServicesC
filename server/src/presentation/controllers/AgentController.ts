import type { Request, Response } from 'express';
import type { ICommandBus } from '../../application/interfaces/ICommandBus';
import type { IQueryBus } from '../../application/interfaces/IQueryBus';
import type { AgentDto, AgentDocumentDto } from '../../application/dto/AgentDto';
import type { ReindexResult } from '../../application/commands/handlers/ReindexAgentCommandHandler';
import type { UploadDocumentFileResult } from '../../application/commands/handlers/UploadDocumentFileCommandHandler';
import { CreateAgentCommand } from '../../application/commands/CreateAgentCommand';
import { UpdateAgentCommand } from '../../application/commands/UpdateAgentCommand';
import { DeleteAgentCommand } from '../../application/commands/DeleteAgentCommand';
import { UploadDocumentCommand } from '../../application/commands/UploadDocumentCommand';
import { UploadDocumentFileCommand } from '../../application/commands/UploadDocumentFileCommand';
import { DeleteDocumentCommand } from '../../application/commands/DeleteDocumentCommand';
import { ReindexAgentCommand } from '../../application/commands/ReindexAgentCommand';
import { GetAgentQuery } from '../../application/queries/GetAgentQuery';
import { ListAgentsQuery } from '../../application/queries/ListAgentsQuery';
import { ListAgentDocumentsQuery } from '../../application/queries/ListAgentDocumentsQuery';
import {
  createAgentSchema,
  updateAgentSchema,
  uploadDocumentSchema,
} from '../validators/agentValidators';
export class AgentController {
  constructor(
    private readonly commandBus: ICommandBus,
    private readonly queryBus: IQueryBus,
  ) {}

  async listAgents(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const query = new ListAgentsQuery(tenantId);
      const agents = await this.queryBus.execute<typeof query, AgentDto[]>(query);
      res.json(agents);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const query = new GetAgentQuery(req.params.id, tenantId);
      const agent = await this.queryBus.execute<typeof query, AgentDto | null>(query);
      
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      
      res.json(agent);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async createAgent(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = createAgentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
        return;
      }

      const tenantId = (req as any).tenantId ?? 'default';
      const { name, systemPrompt, model, description } = parseResult.data;
      
      const command = new CreateAgentCommand(tenantId, name, systemPrompt, model, description);
      const agent = await this.commandBus.execute<typeof command, AgentDto>(command);
      
      res.status(201).json(agent);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async updateAgent(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = updateAgentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
        return;
      }

      const tenantId = (req as any).tenantId ?? 'default';
      const { name, systemPrompt, model, description } = parseResult.data;
      
      const command = new UpdateAgentCommand(req.params.id, tenantId, name, systemPrompt, model, description);
      const agent = await this.commandBus.execute<typeof command, AgentDto>(command);
      
      res.json(agent);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deleteAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const command = new DeleteAgentCommand(req.params.id, tenantId);
      await this.commandBus.execute(command);
      
      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const query = new ListAgentDocumentsQuery(req.params.id, tenantId);
      const documents = await this.queryBus.execute<typeof query, AgentDocumentDto[]>(query);
      res.json(documents);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = uploadDocumentSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
        return;
      }

      const tenantId = (req as any).tenantId ?? 'default';
      const { filename, contentType, rawContent } = parseResult.data;
      
      const command = new UploadDocumentCommand(req.params.id, tenantId, filename, contentType, rawContent);
      const document = await this.commandBus.execute<typeof command, AgentDocumentDto>(command);
      
      res.status(201).json(document);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const command = new DeleteDocumentCommand(req.params.docId, req.params.id, tenantId);
      await this.commandBus.execute(command);
      
      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async uploadDocumentFile(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const useStreaming = req.headers.accept?.includes('text/event-stream');
      const tenantId = (req as any).tenantId ?? 'default';
      
      if (useStreaming) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const sendProgress = (message: string) => {
          res.write(`data: ${JSON.stringify({ type: 'progress', message })}\n\n`);
        };

        try {
          const command = new UploadDocumentFileCommand(
            req.params.id,
            tenantId,
            file.originalname,
            file.mimetype,
            file.buffer,
            sendProgress
          );

          const result = await this.commandBus.execute<typeof command, UploadDocumentFileResult>(command);
          
          res.write(`data: ${JSON.stringify({ type: 'complete', result })}\n\n`);
          res.end();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Upload failed';
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
          res.end();
        }
      } else {
        const command = new UploadDocumentFileCommand(
          req.params.id,
          tenantId,
          file.originalname,
          file.mimetype,
          file.buffer
        );

        const result = await this.commandBus.execute<typeof command, UploadDocumentFileResult>(command);
        res.status(201).json(result);
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  async reindexAgent(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const command = new ReindexAgentCommand(req.params.id, tenantId);
      const result = await this.commandBus.execute<typeof command, ReindexResult>(command);
      
      res.json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleError(res: Response, error: unknown): void {
    console.error('Agent Controller error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: 'Unknown error occurred' });
  }
}
