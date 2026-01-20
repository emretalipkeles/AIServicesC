import type { IOrchestrationPlanner, PlanningContext } from '../../domain/interfaces/IOrchestrationPlanner';
import type { ExecutionPlan } from '../../domain/value-objects/ExecutionPlan';
import type { IAIClient } from '../../domain/interfaces/IAIClient';
import { ModelId } from '../../domain/value-objects/ModelId';
import { AIMessage } from '../../domain/value-objects/AIMessage';

const PLANNING_SYSTEM_PROMPT = `You are an AI orchestration planner. Your job is to analyze user questions and determine which specialized agents (if any) should be called to answer them.

You will be given:
1. A user's question
2. A list of available agents with their IDs, names, and descriptions
3. Conversation history (if any) showing previous interactions and agent executions

Your task:
1. Consider the conversation context - if the user refers to something discussed before or asks follow-up questions, use that context
2. Pay attention to [Agent: Name] prefixes in history - these show which agents were previously used
3. Analyze which agent(s) are relevant to the user's current question based on their descriptions
4. Decide the execution strategy:
   - "single": Only one agent is needed
   - "parallel": Multiple agents can be called simultaneously (their outputs will be combined)
   - "sequential": Agents must be called in order (one agent's output feeds into the next)
5. For each agent, create a refined prompt that includes relevant context from the conversation

IMPORTANT: 
- Only select agents whose descriptions clearly match the user's question. If no agents match, return null.
- If the user is asking a follow-up about a previous agent's response, prefer using the same agent.
- If the user references previous context (e.g., "tell me more about that", "what else?"), include that context in the refined prompt.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{
  "strategy": "single" | "parallel" | "sequential",
  "steps": [
    {
      "agentId": "agent-uuid",
      "agentName": "Agent Name",
      "refinedPrompt": "The refined question for this specific agent, including relevant context",
      "dependsOn": ["previous-agent-id"] // only for sequential, omit for others
    }
  ],
  "reasoning": "Brief explanation of why these agents were selected and the strategy chosen"
}

If no agents match the user's question, respond with exactly: null`;

export class OrchestrationPlanner implements IOrchestrationPlanner {
  constructor(private aiClient: IAIClient) {}

  async createPlan(context: PlanningContext): Promise<ExecutionPlan | null> {
    const agentListText = context.availableAgents
      .map(a => `- ID: ${a.id}\n  Name: ${a.name}\n  Description: ${a.description}`)
      .join('\n\n');

    let conversationHistoryText = '';
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      conversationHistoryText = `\n\nConversation History (most recent last):\n${context.conversationHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n')}\n`;
    }

    const userPrompt = `Available Agents:
${agentListText}
${conversationHistoryText}
User's Current Question: ${context.userMessage}

Analyze which agent(s) should handle this question and create an execution plan. Consider the conversation history if present.`;

    try {
      const response = await this.aiClient.chat({
        model: ModelId.sonnet(),
        systemPrompt: PLANNING_SYSTEM_PROMPT,
        messages: [AIMessage.user(userPrompt)],
        maxTokens: 1024,
        temperature: 0,
      });

      let content = response.content.trim();
      
      if (content === 'null' || content.toLowerCase() === 'null') {
        return null;
      }

      // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
      if (content.startsWith('```')) {
        const lines = content.split('\n');
        // Remove first line (```json or ```) and last line (```)
        const jsonLines = lines.slice(1, lines.length - 1);
        content = jsonLines.join('\n').trim();
      }

      const plan = JSON.parse(content) as ExecutionPlan;
      
      if (!plan.strategy || !Array.isArray(plan.steps) || plan.steps.length === 0) {
        return null;
      }

      return plan;
    } catch (error) {
      console.error('[OrchestrationPlanner] Failed to create plan:', error);
      return null;
    }
  }
}
