import type { ConversationMessageEntity } from '../../domain/interfaces/IConversationRepository';
import type { IConversationSummarizer, ConversationSummary } from '../../domain/interfaces/IConversationSummarizer';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

const SUMMARIZATION_PROMPT = `You are a conversation summarizer for Phix AI. Your task is to create a concise but complete summary of a conversation history.

CRITICAL REQUIREMENTS:
1. Preserve ALL agent interactions - which agents were called, what they did, and their outcomes
2. Preserve key user requests and decisions
3. Maintain context that would be needed for follow-up conversations
4. Be concise but never lose important information
5. CRITICALLY IMPORTANT: Extract and preserve any PRET package context - package names, model names, dimension names, and file paths that were accessed

OUTPUT FORMAT (JSON):
{
  "summary": "A narrative summary of the conversation in 2-3 paragraphs",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "agentInteractions": [
    {
      "agentName": "Name of the agent",
      "action": "What the agent was asked to do",
      "outcome": "The result or output summary"
    }
  ],
  "pretContext": {
    "packageId": "ID/UUID of the PRET package being explored (if any)",
    "packageName": "Name of the PRET package being explored (if any)",
    "activeModelName": "Current model/cube being explored (if any)",
    "loadedFiles": ["List of file paths that were loaded/accessed"]
  }
}

Respond ONLY with valid JSON, no markdown formatting.`;

export class AIConversationSummarizer implements IConversationSummarizer {
  private readonly DEFAULT_THRESHOLD = 20;
  
  constructor(private readonly aiClient: IAIClient) {}
  
  async summarize(messages: ConversationMessageEntity[]): Promise<ConversationSummary> {
    const conversationText = this.formatMessagesForSummarization(messages);
    
    const chatResponse = await this.aiClient.chat({
      model: ModelId.sonnet(),
      messages: [AIMessage.user(`Summarize this conversation:\n\n${conversationText}`)],
      systemPrompt: SUMMARIZATION_PROMPT,
      maxTokens: 2000,
    });
    
    const response = chatResponse.content;
    
    try {
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      const parsed = JSON.parse(cleanedResponse);
      
      return {
        content: parsed.summary || 'Conversation summary',
        originalMessageCount: messages.length,
        keyPoints: parsed.keyPoints || [],
        agentInteractions: parsed.agentInteractions || [],
        pretContext: parsed.pretContext ? {
          packageId: parsed.pretContext.packageId,
          packageName: parsed.pretContext.packageName,
          activeModelName: parsed.pretContext.activeModelName,
          loadedFiles: parsed.pretContext.loadedFiles || [],
        } : this.extractPretContextFromMessages(messages),
      };
    } catch (error) {
      console.error('[AIConversationSummarizer] Failed to parse summary response:', error);
      return {
        content: `Summary of ${messages.length} messages: ${this.createFallbackSummary(messages)}`,
        originalMessageCount: messages.length,
        keyPoints: [],
        agentInteractions: this.extractAgentInteractions(messages),
        pretContext: this.extractPretContextFromMessages(messages),
      };
    }
  }
  
  shouldOptimize(messageCount: number, threshold?: number): boolean {
    return messageCount > (threshold || this.DEFAULT_THRESHOLD);
  }
  
  private formatMessagesForSummarization(messages: ConversationMessageEntity[]): string {
    return messages.map(msg => {
      let roleLabel: string = msg.role;
      
      if (msg.metadata) {
        try {
          const meta = JSON.parse(msg.metadata);
          if (meta.agentName) {
            roleLabel = `Agent: ${meta.agentName}`;
          }
        } catch {}
      }
      
      return `[${roleLabel.toUpperCase()}]: ${msg.content}`;
    }).join('\n\n');
  }
  
  private createFallbackSummary(messages: ConversationMessageEntity[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const agentMessages = messages.filter(m => m.role === 'agent_interaction');
    
    const topics: string[] = [];
    if (userMessages.length > 0) {
      const firstUserMsg = userMessages[0].content.slice(0, 100);
      topics.push(`User discussed: "${firstUserMsg}..."`);
    }
    if (agentMessages.length > 0) {
      topics.push(`${agentMessages.length} agent interaction(s) occurred`);
    }
    
    return topics.join('. ') || 'General conversation';
  }
  
  private extractAgentInteractions(messages: ConversationMessageEntity[]): ConversationSummary['agentInteractions'] {
    return messages
      .filter(m => m.role === 'agent_interaction')
      .map(m => {
        let agentName = 'Unknown Agent';
        let action = 'Performed action';
        
        if (m.metadata) {
          try {
            const meta = JSON.parse(m.metadata);
            agentName = meta.agentName || agentName;
            action = meta.action || action;
          } catch {}
        }
        
        return {
          agentName,
          action,
          outcome: m.content.slice(0, 200) + (m.content.length > 200 ? '...' : ''),
        };
      });
  }
  
  private extractPretContextFromMessages(messages: ConversationMessageEntity[]): ConversationSummary['pretContext'] {
    let packageId: string | undefined;
    let packageName: string | undefined;
    let activeModelName: string | undefined;
    const loadedFiles: string[] = [];
    
    for (const msg of messages) {
      if (msg.metadata) {
        try {
          const meta = JSON.parse(msg.metadata);
          if (meta.packageId) {
            packageId = meta.packageId;
          }
          if (meta.packageName) {
            packageName = meta.packageName;
          }
          if (meta.modelName) {
            activeModelName = meta.modelName;
          }
          if (meta.loadedFiles && Array.isArray(meta.loadedFiles)) {
            for (const file of meta.loadedFiles) {
              if (!loadedFiles.includes(file)) {
                loadedFiles.push(file);
              }
            }
          }
        } catch {}
      }
      
      const content = msg.content;
      const modelMatch = content.match(/(?:model|cube|dimension)\s*[:\-]?\s*["']?([A-Za-z][\w\s]+?)["']?(?:\s|,|\.|\)|$)/i);
      if (modelMatch && !activeModelName) {
        activeModelName = modelMatch[1].trim();
      }
      
      const fileRegex = /(?:file|loaded|reading)[:\s]+["']?([\w\/\-\.]+\.ya?ml)["']?/gi;
      let fileMatch;
      while ((fileMatch = fileRegex.exec(content)) !== null) {
        const file = fileMatch[1];
        if (!loadedFiles.includes(file)) {
          loadedFiles.push(file);
        }
      }
    }
    
    return {
      packageId,
      packageName,
      activeModelName,
      loadedFiles,
    };
  }
}
