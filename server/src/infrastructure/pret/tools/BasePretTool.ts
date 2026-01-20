import { PretTool, type ToolExecutionContext, type ToolExecutionResult } from '../../../domain/pret/entities/PretTool';
import { ObjectType } from '../../../domain/pret/value-objects/ObjectType';
import { YamlOutput } from '../../../domain/pret/value-objects/YamlOutput';
import type { IAIClient, StreamChunk } from '../../../domain/interfaces/IAIClient';
import type { IPretValidator } from '../../../domain/pret/interfaces/IPretValidator';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export abstract class BasePretTool extends PretTool {
  constructor(
    objectType: ObjectType,
    schemaContent: string,
    protected readonly aiClient: IAIClient,
    protected readonly validator: IPretValidator
  ) {
    super(objectType, schemaContent);
  }

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    let fullResponse = '';

    try {
      await this.aiClient.streamChat(
        {
          model: ModelId.sonnet(),
          systemPrompt,
          messages: [AIMessage.user(userPrompt)],
        },
        (chunk: StreamChunk) => {
          if (chunk.type === 'content' && chunk.content) {
            fullResponse += chunk.content;
            context.onChunk?.(chunk.content);
          }
        }
      );

      const yamlContent = this.extractYamlFromResponse(fullResponse);
      
      if (!yamlContent) {
        return {
          success: false,
          clarificationNeeded: fullResponse,
        };
      }

      const objectName = this.extractObjectName(yamlContent);
      
      const validationResult = await this.validator.validateAll(
        yamlContent,
        this._objectType.name,
        this._objectType.schemaPath,
        context.buildContext
      );

      const output = YamlOutput.validated(
        this._objectType.name,
        objectName,
        yamlContent,
        validationResult.allErrors
      );

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  canHandle(objectTypeName: string): boolean {
    return this._objectType.name === objectTypeName;
  }

  protected buildUserPrompt(context: ToolExecutionContext): string {
    let prompt = context.userMessage;

    if (!context.buildContext.isEmpty()) {
      prompt += `\n\n## Current Build Context\n${context.buildContext.toContextString()}`;
    }

    return prompt;
  }

  protected extractObjectName(yamlContent: string): string {
    const nameMatch = yamlContent.match(/name:\s*["']?([^"'\n]+)["']?/);
    if (nameMatch && nameMatch[1]) {
      return nameMatch[1].trim();
    }
    
    const metadataNameMatch = yamlContent.match(/metadata:\s*\n\s*name:\s*["']?([^"'\n]+)["']?/);
    if (metadataNameMatch && metadataNameMatch[1]) {
      return metadataNameMatch[1].trim();
    }

    return 'Unnamed';
  }

  abstract getPromptTemplate(): string;
}
