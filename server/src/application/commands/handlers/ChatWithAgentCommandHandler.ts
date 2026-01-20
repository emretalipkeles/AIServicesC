import type { ICommandHandler } from '../../interfaces/ICommandBus';
import type { ChatWithAgentCommand } from '../ChatWithAgentCommand';
import type { IAgentRepository } from '../../../domain/repositories/IAgentRepository';
import type { IChunkRepository } from '../../../domain/repositories/IChunkRepository';
import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { ChatWithAgentResponseDto } from '../../dto/AgentDto';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export interface IAIClientProvider {
  getClient(tenantId?: string): IAIClient | null;
}

export class ChatWithAgentCommandHandler implements ICommandHandler<ChatWithAgentCommand, ChatWithAgentResponseDto> {
  constructor(
    private readonly agentRepository: IAgentRepository,
    private readonly chunkRepository: IChunkRepository,
    private readonly clientProvider: IAIClientProvider
  ) {}

  async handle(command: ChatWithAgentCommand): Promise<ChatWithAgentResponseDto> {
    const tenantId = command.tenantId ?? 'default';

    const agent = await this.agentRepository.findById(command.agentId, tenantId);
    if (!agent) {
      throw new Error(`Agent not found: ${command.agentId}`);
    }

    const client = this.clientProvider.getClient(tenantId);
    if (!client) {
      throw new Error('AI client not configured');
    }

    const lastUserMessage = [...command.messages].reverse().find(m => m.role === 'user');
    const retrievedChunks: { content: string; score: number; documentId: string }[] = [];

    if (lastUserMessage) {
      const allChunks = await this.chunkRepository.findByAgentId(command.agentId, tenantId);
      
      const queryLower = lastUserMessage.content.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      
      const scoredChunks = allChunks.map(chunk => {
        const contentLower = chunk.content.toLowerCase();
        let score = 0;
        
        for (const word of queryWords) {
          if (contentLower.includes(word)) {
            score += 1;
          }
        }
        
        return { chunk, score };
      });
      
      const topChunks = scoredChunks
        .filter(sc => sc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const { chunk, score } of topChunks) {
        retrievedChunks.push({
          content: chunk.content,
          score: score / queryWords.length,
          documentId: chunk.documentId,
        });
      }
    }

    let contextSection = '';
    if (retrievedChunks.length > 0) {
      contextSection = '\n\n<retrieved_context>\n';
      retrievedChunks.forEach((chunk, idx) => {
        contextSection += `[Source ${idx + 1}]\n${chunk.content}\n\n`;
      });
      contextSection += '</retrieved_context>\n\nUse the above context to inform your response when relevant.';
    }

    const fullSystemPrompt = agent.systemPrompt + contextSection;

    const model = ModelId.fromName(agent.model as any);
    const messages = command.messages.map(m => new AIMessage({ role: m.role, content: m.content }));

    const response = await client.chat({
      model,
      messages,
      maxTokens: command.maxTokens,
      temperature: command.temperature,
      systemPrompt: fullSystemPrompt,
    });

    return {
      content: response.content,
      model: response.model,
      usage: {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        totalTokens: response.inputTokens + response.outputTokens,
      },
      retrievedChunks,
    };
  }
}
