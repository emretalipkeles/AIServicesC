import type { IAgentExecutor, AgentExecutionResult, AgentExecutionContext } from '../../domain/interfaces/IAgentExecutor';
import type { ExecutionStep } from '../../domain/value-objects/ExecutionPlan';
import type { IAgentRepository } from '../../domain/repositories/IAgentRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import type { IAIClientFactory } from '../ai/AIClientFactory';
import type { ISessionMemoryRepository } from '../../domain/interfaces/ISessionMemoryRepository';
import type { IDelayEventsAgentContextProvider } from '../../domain/interfaces/IDelayEventsAgentContextProvider';
import type { Agent } from '../../domain/entities/Agent';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

export class AgentExecutor implements IAgentExecutor {
  private sessionMemoryRepository: ISessionMemoryRepository | null = null;
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

  setSessionMemoryRepository(repository: ISessionMemoryRepository): void {
    this.sessionMemoryRepository = repository;
  }

  setDelayEventsContextProvider(provider: IDelayEventsAgentContextProvider): void {
    this.delayEventsContextProvider = provider;
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
        response: "I can interpret delay events, but I need you to open a delay interpretation project first. Please navigate to a project in the Delay Interpretation section, then ask me your question.",
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
      const msg = "I can interpret delay events, but I need you to open a delay interpretation project first. Please navigate to a project in the Delay Interpretation section, then ask me your question.";
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
