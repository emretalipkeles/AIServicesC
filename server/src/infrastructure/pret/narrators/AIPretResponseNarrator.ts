import type { IAIClient } from '../../../domain/interfaces/IAIClient';
import type { IResponseNarrator, NarratorContext } from '../../../domain/pret';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export class AIPretResponseNarrator implements IResponseNarrator {
  private readonly model: ModelId;

  constructor(private readonly aiClient: IAIClient) {
    this.model = ModelId.sonnet();
  }

  async narrate(context: NarratorContext): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    try {
      const response = await this.aiClient.chat({
        model: this.model,
        messages: [AIMessage.user(userPrompt)],
        systemPrompt,
        maxTokens: 800,
        temperature: 0.3
      });

      return this.sanitizeResponse(response.content.trim());
    } catch (error) {
      console.error('[AIPretResponseNarrator] Narration failed, using fallback:', error);
      return this.sanitizeResponse(this.buildFallbackResponse(context));
    }
  }

  private sanitizeResponse(response: string): string {
    return response
      .replace(/run\s+(the\s+)?command(s)?(\s+again)?/gi, 'try again')
      .replace(/execute\s+(the\s+)?command(s)?/gi, 'proceed')
      .replace(/re-?run\s+(the\s+)?command/gi, 'try again');
  }

  private buildSystemPrompt(): string {
    return `You are a friendly, personable assistant that helps users explore PRET packages. Think of yourself as a knowledgeable colleague who happens to really enjoy their job.

PERSONALITY:
- Be warm and conversational, like chatting with a helpful coworker
- A touch of light humor is welcome when it fits naturally (but never forced)
- Show genuine enthusiasm when sharing interesting findings
- Keep things concise but not robotic

CRITICAL ACCURACY RULES (NON-NEGOTIABLE):
1. ONLY describe what is in the provided data. Do NOT add, invent, or hallucinate any information.
2. Do NOT mention features, capabilities, or data that is not explicitly in the command result.
3. If the data shows 6 dimensions, say "6 dimensions" - never round, estimate, or say "several"
4. Use exact names, counts, and values from the data provided.
5. Never offer to do things you cannot do or suggest next steps that aren't in the available commands.
6. If suggesting alternatives, ONLY mention commands from the availableCommands list in the data.
7. NEVER tell users to "run a command" or "execute a command" - users interact through natural conversation, not commands. Instead say things like "Would you like me to try with the corrected name?" or "Let me know if you'd like to proceed."
8. If you detect a typo or suggest a correction, ask the user to confirm the corrected value and indicate you can proceed automatically once confirmed.

FORMATTING:
- Keep responses concise: 2-4 sentences for simple results, up to 6 for detailed ones
- Use bullet points for lists with more than 3 items
- Skip filler phrases like "I see that..." - just get to the good stuff

ERROR HANDLING:
- If something went wrong, explain clearly based ONLY on the error message
- Be helpful about what they could try differently, but only suggest available commands

Remember: You're accurate AND personable. Facts first, but delivered like a friend who's excited to help.`;
  }

  private buildUserPrompt(context: NarratorContext): string {
    const resultJson = JSON.stringify(context.result, null, 2);
    
    return `User asked: "${context.userMessage}"

Command executed: ${context.commandType}
Success: ${context.wasSuccessful}

Command result data:
${resultJson}

Convert this into a natural, friendly response. Remember: ONLY describe what's in the data above. Do not add anything.`;
  }

  private buildFallbackResponse(context: NarratorContext): string {
    if (!context.wasSuccessful) {
      return `There was an issue: ${context.result.error || 'Command execution failed'}`;
    }

    switch (context.commandType) {
      case 'listModels':
        return this.fallbackListModels(context.result.data);
      case 'listDimensions':
        return this.fallbackListDimensions(context.result.data);
      case 'getCubeDetails':
        return this.fallbackCubeDetails(context.result.data);
      case 'getDimensionDetails':
        return this.fallbackDimensionDetails(context.result.data);
      case 'outOfScope':
        return this.fallbackOutOfScope(context.result.data);
      default:
        return context.result.message || 'Command completed successfully.';
    }
  }

  private fallbackListModels(data: unknown): string {
    const d = data as { models: Array<{ name: string }>; totalCount: number };
    if (!d.models || d.models.length === 0) {
      return 'No models found in the package.';
    }
    return `Found ${d.totalCount} model(s): ${d.models.map(m => m.name).join(', ')}.`;
  }

  private fallbackListDimensions(data: unknown): string {
    const d = data as { dimensions: Array<{ name: string }>; totalCount: number };
    if (!d.dimensions || d.dimensions.length === 0) {
      return 'No dimensions found.';
    }
    return `Found ${d.totalCount} dimension(s).`;
  }

  private fallbackCubeDetails(data: unknown): string {
    const d = data as { cube: { name: string; dimensions: Array<unknown> }; dimensionDetails: Array<unknown> };
    if (!d.cube) {
      return 'Cube not found.';
    }
    return `The ${d.cube.name} cube has ${d.dimensionDetails?.length || 0} dimensions.`;
  }

  private fallbackDimensionDetails(data: unknown): string {
    const d = data as { dimension: { name: string; memberCount: number } };
    if (!d.dimension) {
      return 'Dimension not found.';
    }
    return `The ${d.dimension.name} dimension has ${d.dimension.memberCount} members.`;
  }

  private fallbackOutOfScope(data: unknown): string {
    const d = data as { 
      availableCommands: Array<{ name: string; description: string }>; 
      reasoning?: string;
      userRequest: string;
    };
    
    const commandList = d.availableCommands
      .map(cmd => `- **${cmd.name}**: ${cmd.description}`)
      .join('\n');
    
    const reasoningText = d.reasoning ? `\n\n*${d.reasoning}*` : '';
    
    return `I can't help with that particular request just yet.${reasoningText}

Here's what I can do right now:

${commandList}

Let me know if any of these would help!`;
  }
}
