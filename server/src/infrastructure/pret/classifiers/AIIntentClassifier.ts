import type { IAIClient, ChatOptions } from '../../../domain/interfaces/IAIClient';
import type { IIntentClassifier, CommandDescriptor, PretCommandType } from '../../../domain/pret';
import { ClassifiedIntent } from '../../../domain/pret';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

interface AIClassificationResponse {
  command: string | null;
  args: Record<string, unknown>;
  confidence: number;
  reasoning: string;
}

export class AIIntentClassifier implements IIntentClassifier {
  private readonly model: ModelId;

  constructor(private readonly aiClient: IAIClient) {
    this.model = ModelId.sonnet();
  }

  async classify(
    message: string,
    availableCommands: CommandDescriptor[]
  ): Promise<ClassifiedIntent> {
    const systemPrompt = this.buildSystemPrompt(availableCommands);
    
    try {
      const response = await this.aiClient.chat({
        model: this.model,
        messages: [AIMessage.user(message)],
        systemPrompt,
        maxTokens: 500,
        temperature: 0
      });

      const parsed = this.parseResponse(response.content);
      
      console.log('[AIIntentClassifier] Classified:', {
        command: parsed.command,
        args: parsed.args,
        confidence: parsed.confidence
      });

      return ClassifiedIntent.create({
        commandType: parsed.command as PretCommandType | null,
        args: parsed.args,
        confidence: parsed.confidence,
        rawMessage: message,
        reasoning: parsed.reasoning
      });
    } catch (error) {
      console.error('[AIIntentClassifier] Classification failed:', error);
      return ClassifiedIntent.noMatch(message);
    }
  }

  private buildSystemPrompt(commands: CommandDescriptor[]): string {
    const commandList = commands.map(cmd => {
      const argsDescription = cmd.args.length > 0
        ? `\n    Args: ${cmd.args.map(a => `${a.name} (${a.type}${a.required ? ', required' : ''}): ${a.description}`).join('; ')}`
        : '';
      const examplesText = cmd.examples.length > 0
        ? `\n    Examples: "${cmd.examples.join('", "')}"`
        : '';
      return `  - ${cmd.name}: ${cmd.description}${argsDescription}${examplesText}`;
    }).join('\n');

    return `You are an intent classifier for a PRET package exploration system. Your job is to determine which command the user wants to execute and extract any relevant arguments.

Available commands:
${commandList}

IMPORTANT RULES:
1. Only classify to commands listed above. If the user's request doesn't match any command, set command to null with confidence 0.
2. If the user asks about something NOT supported (like MDX formulas, calculations, editing, creating, validating), set command to null.
3. Extract entity names exactly as mentioned by the user (e.g., "account", "Account", "time dimension" -> extract "time" or "time dimension").
4. Be flexible with synonyms: "cube" = "model", "dim" = "dimension".
5. For dimension-related queries, always try to extract the dimension name even if phrased differently.
6. NEVER guess or force-match a command. If unsure, return null.

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{"command": "commandName or null", "args": {"argName": "value"}, "confidence": 0.0-1.0, "reasoning": "brief explanation"}

Examples:
- "how many models do I have" -> {"command": "listModels", "args": {}, "confidence": 0.95, "reasoning": "User asking to list/count models"}
- "tell me about the Account dimension" -> {"command": "getDimensionDetails", "args": {"dimensionName": "Account"}, "confidence": 0.95, "reasoning": "User wants details about Account dimension"}
- "how many members does account dim have" -> {"command": "getDimensionDetails", "args": {"dimensionName": "account"}, "confidence": 0.9, "reasoning": "User asking about member count for account dimension"}
- "what dimensions are in the PL cube" -> {"command": "getCubeDetails", "args": {"cubeName": "PL"}, "confidence": 0.9, "reasoning": "User wants cube details including its dimensions"}
- "do any dims have MDX formulas" -> {"command": null, "args": {}, "confidence": 0, "reasoning": "User asking about MDX formulas which is not a supported command"}
- "show me the calculations" -> {"command": null, "args": {}, "confidence": 0, "reasoning": "Calculations/formulas not supported"}`;
  }

  private parseResponse(content: string): AIClassificationResponse {
    try {
      const cleaned = content.trim().replace(/^```json\s*/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return {
        command: parsed.command || null,
        args: parsed.args || {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      console.error('[AIIntentClassifier] Failed to parse response:', content);
      return {
        command: null,
        args: {},
        confidence: 0,
        reasoning: 'Failed to parse AI response'
      };
    }
  }
}
