import type { IAgentExecutor, AgentExecutionResult, AgentExecutionContext } from '../../domain/interfaces/IAgentExecutor';
import type { ExecutionStep } from '../../domain/value-objects/ExecutionPlan';
import type { IAgentRepository } from '../../domain/repositories/IAgentRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import type { IAIClientFactory } from '../ai/AIClientFactory';
import type { PretOrchestrator } from '../../application/pret/services/PretOrchestrator';
import type { PretCommandExecutor } from '../../application/pret/services/PretCommandExecutor';
import type { IConversationContextRepository } from '../../domain/orchestration/interfaces/IConversationContextRepository';
import type { ISessionMemoryRepository } from '../../domain/interfaces/ISessionMemoryRepository';
import type { IPackageAnalysisCache } from '../../domain/pret';
import type { IDelayEventsAgentContextProvider } from '../../domain/interfaces/IDelayEventsAgentContextProvider';
import type { Agent } from '../../domain/entities/Agent';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

export class AgentExecutor implements IAgentExecutor {
  private pretOrchestrator: PretOrchestrator | null = null;
  private pretCommandExecutor: PretCommandExecutor | null = null;
  private conversationContextRepository: IConversationContextRepository | null = null;
  private sessionMemoryRepository: ISessionMemoryRepository | null = null;
  private packageAnalysisCache: IPackageAnalysisCache | null = null;
  private delayEventsContextProvider: IDelayEventsAgentContextProvider | null = null;

  private static readonly STREAM_CHUNK_SIZE = 8;
  private static readonly STREAM_DELAY_MS = 10;

  constructor(
    private agentRepository: IAgentRepository,
    private chunkRepository: IChunkRepository,
    private aiClientFactory: IAIClientFactory
  ) {}

  private async streamResponse(
    text: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const words = text.split(/(\s+)/);
    let buffer = '';
    
    for (const word of words) {
      buffer += word;
      
      if (buffer.length >= AgentExecutor.STREAM_CHUNK_SIZE) {
        onChunk(buffer);
        buffer = '';
        await this.delay(AgentExecutor.STREAM_DELAY_MS);
      }
    }
    
    if (buffer.length > 0) {
      onChunk(buffer);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setPretOrchestrator(orchestrator: PretOrchestrator): void {
    this.pretOrchestrator = orchestrator;
  }

  setPretCommandExecutor(executor: PretCommandExecutor | null): void {
    this.pretCommandExecutor = executor;
  }

  setConversationContextRepository(repository: IConversationContextRepository): void {
    this.conversationContextRepository = repository;
  }

  setPackageAnalysisCache(cache: IPackageAnalysisCache): void {
    this.packageAnalysisCache = cache;
  }

  setSessionMemoryRepository(repository: ISessionMemoryRepository): void {
    this.sessionMemoryRepository = repository;
  }

  setDelayEventsContextProvider(provider: IDelayEventsAgentContextProvider): void {
    this.delayEventsContextProvider = provider;
  }

  private isPretAgent(agentType?: string): boolean {
    return agentType === 'pret' || agentType === 'PRET';
  }

  private isDelayEventsAgent(agentType?: string): boolean {
    return agentType === 'delay-events';
  }

  async execute(
    step: ExecutionStep,
    tenantId: string,
    previousResults?: Map<string, AgentExecutionResult>,
    conversationId?: string,
    context?: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    try {
      const agent = await this.agentRepository.findById(step.agentId, tenantId);
      
      if (!agent) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `Agent ${step.agentName} not found`,
        };
      }

      if (this.isPretAgent(agent.agentType) && this.pretOrchestrator) {
        return this.executePretAgent(step, tenantId, agent, conversationId);
      }

      if (this.isDelayEventsAgent(agent.agentType)) {
        return this.executeDelayEventsAgent(step, tenantId, agent, context);
      }

      const chunks = await this.chunkRepository.findByAgentId(step.agentId, tenantId);
      const contextText = chunks.slice(0, 10).map(c => c.content).join('\n\n---\n\n');

      let prompt = step.refinedPrompt;
      
      if (previousResults && step.dependsOn) {
        const previousContext = step.dependsOn
          .map(depId => previousResults.get(depId))
          .filter(r => r && r.success)
          .map(r => `Previous response from ${r!.agentName}:\n${r!.response}`)
          .join('\n\n');
        
        if (previousContext) {
          prompt = `${previousContext}\n\nBased on the above context, ${prompt}`;
        }
      }

      const systemPrompt = agent.systemPrompt + (contextText 
        ? `\n\nRelevant context from your knowledge base:\n${contextText}` 
        : '');

      const model = ModelId.fromString(agent.model);
      const aiClient = this.aiClientFactory.getClientForModel(model);
      
      if (!aiClient) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `No AI client configured for model: ${agent.model}`,
        };
      }

      const response = await aiClient.chat({
        model,
        systemPrompt,
        messages: [AIMessage.user(prompt)],
        maxTokens: 2048,
        temperature: 0.7,
      });

      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: response.content,
        success: true,
      };
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async executePretAgent(
    step: ExecutionStep,
    tenantId: string,
    agent: Agent,
    conversationId?: string
  ): Promise<AgentExecutionResult> {
    if (!this.pretOrchestrator) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: 'PRET orchestrator not configured',
      };
    }

    try {
      const contextInfo = await this.getPackageContext(tenantId, conversationId);
      
      const result = await this.pretOrchestrator.generate({
        tenantId,
        conversationId: conversationId || step.agentId,
        packageId: contextInfo?.packageId,
        userMessage: step.refinedPrompt,
        conversationHistory: [],
        packageAnalysis: contextInfo?.packageAnalysis,
      });

      if (result.success && result.yaml) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: result.yaml.formattedOutput,
          success: true,
        };
      } else if (result.clarificationNeeded) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: result.clarificationNeeded,
          success: true,
        };
      } else {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: result.error || 'PRET generation failed',
        };
      }
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'PRET execution error',
      };
    }
  }

  private async getPackageContext(
    tenantId: string,
    conversationId?: string
  ): Promise<{ packageId: string; packageAnalysis?: import('../../domain/pret').PackageAnalysisData } | null> {
    if (!conversationId || !this.conversationContextRepository) {
      console.log('[AgentExecutor.getPackageContext] No conversationId or context repository');
      return null;
    }

    try {
      const context = await this.conversationContextRepository.findByConversationId(
        conversationId,
        tenantId
      );

      if (!context?.currentPackageId) {
        console.log('[AgentExecutor.getPackageContext] No currentPackageId in context for conversation:', conversationId);
        return null;
      }

      console.log('[AgentExecutor.getPackageContext] Found packageId:', context.currentPackageId, 'for conversation:', conversationId);

      const packageAnalysis = this.packageAnalysisCache?.get(context.currentPackageId);
      
      console.log('[AgentExecutor.getPackageContext] PackageAnalysis from cache:', packageAnalysis ? 'found' : 'not found', 
        packageAnalysis ? `(${packageAnalysis.dimensions.length} dimensions, ${packageAnalysis.cubes.length} cubes)` : '');
      
      return {
        packageId: context.currentPackageId,
        packageAnalysis,
      };
    } catch (err) {
      console.error('[AgentExecutor.getPackageContext] Error:', err);
      return null;
    }
  }

  async executeStream(
    step: ExecutionStep,
    tenantId: string,
    onChunk: (chunk: string) => void,
    previousResults?: Map<string, AgentExecutionResult>,
    conversationId?: string,
    context?: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    try {
      const agent = await this.agentRepository.findById(step.agentId, tenantId);
      
      if (!agent) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `Agent ${step.agentName} not found`,
        };
      }

      if (this.isPretAgent(agent.agentType) && this.pretOrchestrator) {
        return this.executePretAgentStream(step, tenantId, agent, onChunk, conversationId);
      }

      if (this.isDelayEventsAgent(agent.agentType)) {
        return this.executeDelayEventsAgentStream(step, tenantId, agent, onChunk, context);
      }

      const chunks = await this.chunkRepository.findByAgentId(step.agentId, tenantId);
      const contextText = chunks.slice(0, 10).map(c => c.content).join('\n\n---\n\n');

      let prompt = step.refinedPrompt;
      
      if (previousResults && step.dependsOn) {
        const previousContext = step.dependsOn
          .map(depId => previousResults.get(depId))
          .filter(r => r && r.success)
          .map(r => `Previous response from ${r!.agentName}:\n${r!.response}`)
          .join('\n\n');
        
        if (previousContext) {
          prompt = `${previousContext}\n\nBased on the above context, ${prompt}`;
        }
      }

      const systemPrompt = agent.systemPrompt + (contextText 
        ? `\n\nRelevant context from your knowledge base:\n${contextText}` 
        : '');

      const model = ModelId.fromString(agent.model);
      const aiClient = this.aiClientFactory.getClientForModel(model);
      
      if (!aiClient) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `No AI client configured for model: ${agent.model}`,
        };
      }

      let fullResponse = '';

      await aiClient.streamChat(
        {
          model,
          systemPrompt,
          messages: [AIMessage.user(prompt)],
          maxTokens: 2048,
          temperature: 0.7,
        },
        (streamChunk) => {
          if (streamChunk.type === 'content' && streamChunk.content) {
            fullResponse += streamChunk.content;
            onChunk(streamChunk.content);
          }
        }
      );

      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: fullResponse,
        success: true,
      };
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async executePretAgentStream(
    step: ExecutionStep,
    tenantId: string,
    agent: Agent,
    onChunk: (chunk: string) => void,
    conversationId?: string
  ): Promise<AgentExecutionResult> {
    try {
      const contextInfo = await this.getPackageContext(tenantId, conversationId);
      
      if (this.pretCommandExecutor) {
        if (!contextInfo?.packageId) {
          console.log('[AgentExecutor] No package context, returning upload message');
          const noPackageMessage = "I don't have access to a PRET package yet. Please upload your package ZIP file first, and then I can help you explore its contents.";
          await this.streamResponse(noPackageMessage, onChunk);
          return {
            agentId: step.agentId,
            agentName: step.agentName,
            response: noPackageMessage,
            success: true,
          };
        }

        console.log('[AgentExecutor] Trying command executor for PRET request');
        const commandResult = await this.pretCommandExecutor.execute({
          packageId: contextInfo.packageId,
          tenantId,
          userMessage: step.refinedPrompt,
        });

        if (commandResult.handled && commandResult.formattedResponse) {
          const isSuccess = commandResult.result?.success !== false;
          console.log('[AgentExecutor] Command handled:', commandResult.intent?.commandType, 'success:', isSuccess);
          
          if (commandResult.interactionSummary && conversationId && this.sessionMemoryRepository) {
            const existingMemory = await this.sessionMemoryRepository.get(conversationId, tenantId);
            if (existingMemory) {
              const updatedMemory = existingMemory.withKeyPoint(commandResult.interactionSummary.toMemoryEntry());
              await this.sessionMemoryRepository.save(conversationId, tenantId, updatedMemory);
              console.log('[AgentExecutor] Stored PRET interaction in session memory');
            }
          }
          
          const isMutationCommand = commandResult.intent?.commandType === 'createOtherDimension';
          const shouldNotifyPackageUpdate = isSuccess && isMutationCommand && contextInfo?.packageId;
          
          await this.streamResponse(commandResult.formattedResponse, onChunk);
          return {
            agentId: step.agentId,
            agentName: step.agentName,
            response: commandResult.formattedResponse,
            success: isSuccess,
            error: !isSuccess ? commandResult.result?.error : undefined,
            metadata: shouldNotifyPackageUpdate ? {
              packageUpdated: true,
              packageId: contextInfo.packageId,
            } : undefined,
          };
        }
        
        console.log('[AgentExecutor] Command not handled, falling back to AI orchestrator');
      }

      if (!this.pretOrchestrator) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: 'PRET orchestrator not configured',
        };
      }
      
      const sessionMemory = conversationId && this.sessionMemoryRepository
        ? await this.sessionMemoryRepository.get(conversationId, tenantId)
        : null;
      
      const result = await this.pretOrchestrator.generateStream({
        tenantId,
        conversationId: conversationId || step.agentId,
        packageId: contextInfo?.packageId,
        userMessage: step.refinedPrompt,
        conversationHistory: [],
        packageAnalysis: contextInfo?.packageAnalysis,
        onChunk,
        sessionMemory: sessionMemory || undefined,
      });

      if (result.updatedSessionMemory && conversationId && this.sessionMemoryRepository) {
        await this.sessionMemoryRepository.save(conversationId, tenantId, result.updatedSessionMemory);
        console.log('[AgentExecutor] Persisted updated session memory:', {
          conversationId,
          loadedFiles: result.updatedSessionMemory.getLoadedFiles()?.length ?? 0,
          modelName: result.updatedSessionMemory.getActiveModelName(),
        });
      }

      if (result.success && result.yaml) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: result.yaml.formattedOutput,
          success: true,
        };
      } else if (result.clarificationNeeded) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: result.clarificationNeeded,
          success: true,
        };
      } else {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: result.error || 'PRET generation failed',
        };
      }
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'PRET stream execution error',
      };
    }
  }

  private async executeDelayEventsAgent(
    step: ExecutionStep,
    tenantId: string,
    agent: Agent,
    context?: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    if (!this.delayEventsContextProvider) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: 'Delay events context provider not configured',
      };
    }

    if (!context?.activeDelayAnalysisProjectId) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: "I can analyze delay events, but I need you to open a delay analysis project first. Please navigate to a project in the Delay Analysis section, then ask me your question.",
        success: true,
      };
    }

    try {
      const delayContext = await this.delayEventsContextProvider.getContext(
        context.activeDelayAnalysisProjectId,
        tenantId
      );

      const systemPrompt = agent.systemPrompt + delayContext.systemPromptAddition;
      const model = ModelId.fromString(agent.model);
      const aiClient = this.aiClientFactory.getClientForModel(model);

      if (!aiClient) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `No AI client configured for model: ${agent.model}`,
        };
      }

      const response = await aiClient.chat({
        model,
        systemPrompt,
        messages: [AIMessage.user(step.refinedPrompt)],
        maxTokens: 2048,
        temperature: 0.7,
      });

      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: response.content,
        success: true,
      };
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'Delay events agent execution error',
      };
    }
  }

  private async executeDelayEventsAgentStream(
    step: ExecutionStep,
    tenantId: string,
    agent: Agent,
    onChunk: (chunk: string) => void,
    context?: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    if (!this.delayEventsContextProvider) {
      const errorMsg = 'Delay events context provider not configured';
      await this.streamResponse(errorMsg, onChunk);
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: errorMsg,
        success: false,
        error: errorMsg,
      };
    }

    if (!context?.activeDelayAnalysisProjectId) {
      const msg = "I can analyze delay events, but I need you to open a delay analysis project first. Please navigate to a project in the Delay Analysis section, then ask me your question.";
      await this.streamResponse(msg, onChunk);
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: msg,
        success: true,
      };
    }

    try {
      const delayContext = await this.delayEventsContextProvider.getContext(
        context.activeDelayAnalysisProjectId,
        tenantId
      );

      const systemPrompt = agent.systemPrompt + delayContext.systemPromptAddition;
      const model = ModelId.fromString(agent.model);
      const aiClient = this.aiClientFactory.getClientForModel(model);

      if (!aiClient) {
        return {
          agentId: step.agentId,
          agentName: step.agentName,
          response: '',
          success: false,
          error: `No AI client configured for model: ${agent.model}`,
        };
      }

      let fullResponse = '';

      await aiClient.streamChat(
        {
          model,
          systemPrompt,
          messages: [AIMessage.user(step.refinedPrompt)],
          maxTokens: 2048,
          temperature: 0.7,
        },
        (streamChunk) => {
          if (streamChunk.type === 'content' && streamChunk.content) {
            fullResponse += streamChunk.content;
            onChunk(streamChunk.content);
          }
        }
      );

      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: fullResponse,
        success: true,
      };
    } catch (error) {
      return {
        agentId: step.agentId,
        agentName: step.agentName,
        response: '',
        success: false,
        error: error instanceof Error ? error.message : 'Delay events stream execution error',
      };
    }
  }
}
