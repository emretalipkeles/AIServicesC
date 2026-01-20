import type { Request, Response } from 'express';
import type { OrchestrateCommandHandler, OrchestrationProgress } from '../../application/commands/handlers/OrchestrateCommandHandler';
import type { IConversationRepository } from '../../domain/interfaces/IConversationRepository';
import type { IConversationSummarizer } from '../../domain/interfaces/IConversationSummarizer';
import type { ISessionMemoryRepository } from '../../domain/interfaces/ISessionMemoryRepository';
import type { UpdateConversationContextHandler } from '../../application/orchestration/handlers/UpdateConversationContextHandler';
import type { NarrateUploadResultHandler } from '../../application/orchestration/handlers/NarrateUploadResultHandler';
import { OrchestrateCommand } from '../../application/commands/OrchestrateCommand';
import { UpdateConversationContextCommand } from '../../application/orchestration/commands/UpdateConversationContextCommand';
import { NarrateUploadResultCommand } from '../../application/orchestration/commands/NarrateUploadResultCommand';
import { orchestrateRequestSchema } from '../validators/orchestratorValidators';
import { uploadResultRequestSchema } from '../validators/uploadResultValidators';
import { PretSessionMemory } from '../../domain/value-objects/PretSessionMemory';

interface ConversationMessageMetadata {
  agentId?: string;
  agentName?: string;
  success?: boolean;
  originalMessageCount?: number;
}

const MEMORY_OPTIMIZATION_THRESHOLD = 20;

export class OrchestratorController {
  constructor(
    private commandHandler: OrchestrateCommandHandler,
    private conversationRepository: IConversationRepository,
    private conversationSummarizer: IConversationSummarizer,
    private sessionMemoryRepository: ISessionMemoryRepository,
    private updateContextHandler?: UpdateConversationContextHandler,
    private narrateUploadResultHandler?: NarrateUploadResultHandler | null
  ) {}

  async handleUploadResult(req: Request, res: Response): Promise<void> {
    const parseResult = uploadResultRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      return;
    }

    const tenantId = (req as any).tenantId || 'default';
    const { conversationId, packageId, packageName, s3Path, success, error } = parseResult.data;

    try {
      if (success && conversationId && s3Path && this.updateContextHandler) {
        const command = new UpdateConversationContextCommand(
          conversationId,
          tenantId,
          packageId,
          packageName,
          s3Path
        );
        await this.updateContextHandler.handle(command);
      }

      let responseMessage: string;
      
      if (this.narrateUploadResultHandler) {
        const narrateCommand = new NarrateUploadResultCommand(
          success,
          packageName,
          packageId,
          error || undefined,
          undefined
        );
        const narratorResponse = await this.narrateUploadResultHandler.handle(narrateCommand);
        responseMessage = narratorResponse.message;
      } else {
        responseMessage = success
          ? `I've successfully imported your PRET package "${packageName}". You can now view and edit its contents in the Package Editor. Ask me to make any changes to the package.`
          : `Failed to import package: ${error || 'Unknown error'}`;
      }

      res.json({
        success: true,
        message: responseMessage,
        packageInfo: success ? { packageId, packageName, redirectUrl: `/pret/${packageId}` } : undefined,
      });
    } catch (err) {
      console.error('[OrchestratorController] Upload result handling failed:', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to process upload result',
      });
    }
  }

  async streamOrchestrate(req: Request, res: Response): Promise<void> {
    const parseResult = orchestrateRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.errors });
      return;
    }

    const { message, conversationId: clientConversationId } = parseResult.data;
    const tenantId = (req as any).tenantId || 'default';

    console.log('[OrchestratorController] streamOrchestrate called with conversationId:', clientConversationId, 'message:', message.substring(0, 50));

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sendEvent = (progress: OrchestrationProgress & { conversationId?: string }) => {
      const eventData = JSON.stringify(progress);
      res.write(`data: ${eventData}\n\n`);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    try {
      let conversationId = clientConversationId;
      let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      if (conversationId) {
        const existingConversation = await this.conversationRepository.getConversationById(conversationId, tenantId);
        if (!existingConversation) {
          console.log('[OrchestratorController] Conversation not found:', conversationId);
          conversationId = undefined;
        } else {
          console.log('[OrchestratorController] Found existing conversation:', conversationId);
        }
      }

      if (!conversationId) {
        const newConversation = await this.conversationRepository.createConversation({ tenantId });
        conversationId = newConversation.id;
        console.log('[OrchestratorController] Created new conversation:', conversationId);
        sendEvent({ type: 'discovery', conversationId });
      } else {
        sendEvent({ type: 'discovery', conversationId });
      }

      const existingMessages = await this.conversationRepository.getMessages(conversationId, tenantId, 50);
      console.log('[OrchestratorController] Loaded', existingMessages.length, 'existing messages for conversation:', conversationId);
      conversationHistory = existingMessages.map(msg => {
        if (msg.role === 'agent_interaction') {
          let metadata: ConversationMessageMetadata = {};
          try {
            if (msg.metadata) metadata = JSON.parse(msg.metadata);
          } catch {}
          return {
            role: 'assistant' as const,
            content: `[Agent: ${metadata.agentName || 'Unknown'}] ${msg.content}`,
          };
        }
        if (msg.role === 'summary') {
          return {
            role: 'assistant' as const,
            content: `[Previous Context Summary] ${msg.content}`,
          };
        }
        return {
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content,
        };
      });

      await this.conversationRepository.addMessage({
        conversationId,
        role: 'user',
        content: message,
      }, tenantId);

      const command = new OrchestrateCommand(tenantId, message, conversationHistory, conversationId);

      let fullAssistantResponse = '';
      let currentAgentResponses: Map<string, { name: string; content: string }> = new Map();

      const wrappedOnProgress = async (progress: OrchestrationProgress) => {
        sendEvent({ ...progress, conversationId });

        if (progress.type === 'agent-chunk' && progress.agentId && progress.content) {
          const existing = currentAgentResponses.get(progress.agentId);
          if (existing) {
            existing.content += progress.content;
          } else {
            currentAgentResponses.set(progress.agentId, {
              name: progress.agentName || 'Unknown Agent',
              content: progress.content,
            });
          }
        }

        if (progress.type === 'agent-done' && progress.agentId) {
          const agentResponse = currentAgentResponses.get(progress.agentId);
          if (agentResponse && agentResponse.content) {
            const metadata: ConversationMessageMetadata = {
              agentId: progress.agentId,
              agentName: agentResponse.name,
              success: !progress.content,
            };
            await this.conversationRepository.addMessage({
              conversationId: conversationId!,
              role: 'agent_interaction',
              content: agentResponse.content,
              metadata: JSON.stringify(metadata),
            }, tenantId);
          }
        }

        if (progress.type === 'synthesis-chunk' && progress.content) {
          fullAssistantResponse += progress.content;
        }

        if (progress.type === 'synthesis-done' && fullAssistantResponse) {
          await this.conversationRepository.addMessage({
            conversationId: conversationId!,
            role: 'assistant',
            content: fullAssistantResponse,
          }, tenantId);
        }
      };

      await this.commandHandler.handleStream(command, wrappedOnProgress);

      const messageCount = await this.conversationRepository.getMessageCount(conversationId, tenantId);
      if (this.conversationSummarizer.shouldOptimize(messageCount, MEMORY_OPTIMIZATION_THRESHOLD)) {
        sendEvent({ type: 'memory-optimizing', content: 'Optimizing conversation memory...', conversationId });
        await this.optimizeMemory(conversationId, tenantId);
        sendEvent({ type: 'memory-optimized', content: 'Memory optimization complete', conversationId });
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('[OrchestratorController] Stream error:', error);
      sendEvent({ 
        type: 'error', 
        content: error instanceof Error ? error.message : 'Orchestration failed' 
      });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  private async optimizeMemory(conversationId: string, tenantId: string): Promise<void> {
    try {
      const allMessages = await this.conversationRepository.getMessages(conversationId, tenantId);
      
      const messagesToSummarize = allMessages.slice(0, -10);
      
      if (messagesToSummarize.length < 5) return;
      
      console.log(`[OrchestratorController] Optimizing memory: summarizing ${messagesToSummarize.length} messages`);
      
      const summary = await this.conversationSummarizer.summarize(messagesToSummarize);
      
      if (summary.pretContext) {
        const existingMemory = await this.sessionMemoryRepository.get(conversationId, tenantId);
        
        const resolvedPackageId = summary.pretContext.packageId || existingMemory?.getPackageId();
        if (!resolvedPackageId) return;
        
        const sessionMemory = new PretSessionMemory({
          packageId: resolvedPackageId,
          packageName: summary.pretContext.packageName || existingMemory?.getPackageName(),
          activeModelName: summary.pretContext.activeModelName || existingMemory?.getActiveModelName(),
          loadedFiles: [
            ...(existingMemory?.getLoadedFiles() || []),
            ...summary.pretContext.loadedFiles,
          ].filter((f, i, arr) => arr.indexOf(f) === i),
          keyPoints: [
            ...(existingMemory?.getKeyPoints() || []),
            ...summary.keyPoints,
          ].filter((p, i, arr) => arr.indexOf(p) === i).slice(-10),
          lastUpdated: new Date(),
        });
        
        await this.sessionMemoryRepository.save(conversationId, tenantId, sessionMemory);
        console.log(`[OrchestratorController] Session memory preserved: ${sessionMemory.getActiveModelName() || 'no model'}, ${sessionMemory.getLoadedFiles().length} files`);
      }
      
      const metadata: ConversationMessageMetadata = {
        originalMessageCount: summary.originalMessageCount,
      };
      
      await this.conversationRepository.replaceMessagesWithSummary(
        conversationId,
        tenantId,
        messagesToSummarize.map(m => m.id),
        summary.content,
        JSON.stringify(metadata)
      );
      
      console.log(`[OrchestratorController] Memory optimized: ${messagesToSummarize.length} messages -> 1 summary`);
    } catch (error) {
      console.error('[OrchestratorController] Memory optimization failed:', error);
    }
  }
}
