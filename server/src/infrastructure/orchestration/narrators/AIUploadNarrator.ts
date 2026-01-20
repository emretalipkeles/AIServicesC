import type { IUploadNarrator, UploadNarratorContext, NarratorResponse, NarratorStreamChunk, NarratorStreamOptions } from '../../../domain/orchestration/interfaces/IUploadNarrator';
import type { IAIClient, StreamChunk } from '../../../domain/interfaces/IAIClient';
import { ModelId } from '../../../domain/value-objects/ModelId';
import { AIMessage } from '../../../domain/value-objects/AIMessage';

export class AIUploadNarrator implements IUploadNarrator {
  constructor(private readonly aiClient: IAIClient) {}

  async narrate(context: UploadNarratorContext): Promise<NarratorResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    try {
      let message = '';
      
      await this.aiClient.streamChat(
        {
          model: new ModelId('claude-sonnet-4-5'),
          messages: [AIMessage.user(userPrompt)],
          systemPrompt,
          maxTokens: 256,
          temperature: 0.7,
        },
        (chunk: StreamChunk) => {
          if (chunk.type === 'content' && chunk.content) {
            message += chunk.content;
          }
        }
      );

      return {
        message: message.trim() || this.getFallbackResponse(context).message,
        tone: context.success ? 'success' : 'error',
      };
    } catch (error) {
      return this.getFallbackResponse(context);
    }
  }

  async streamNarrate(
    context: UploadNarratorContext,
    onChunk: (chunk: NarratorStreamChunk) => void,
    options?: NarratorStreamOptions
  ): Promise<void> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);
    const tone = context.success ? 'success' : 'error';

    try {
      await this.aiClient.streamChat(
        {
          model: new ModelId('claude-sonnet-4-5'),
          messages: [AIMessage.user(userPrompt)],
          systemPrompt,
          maxTokens: 256,
          temperature: 0.7,
        },
        (chunk: StreamChunk) => {
          if (chunk.type === 'content' && chunk.content) {
            onChunk({ type: 'content', content: chunk.content });
          } else if (chunk.type === 'done') {
            onChunk({ type: 'done', tone });
          } else if (chunk.type === 'error') {
            onChunk({ type: 'error', error: chunk.error });
          }
        },
        { abortSignal: options?.abortSignal }
      );
    } catch (error) {
      const fallback = this.getFallbackResponse(context);
      onChunk({ type: 'content', content: fallback.message });
      onChunk({ type: 'done', tone: fallback.tone });
    }
  }

  private buildSystemPrompt(): string {
    return `You are Phix, a friendly and witty AI assistant for the Prophix FP&A Plus implementation platform. 
Your personality is helpful, professional, but with a touch of humor. You use subtle wit to make technical interactions more enjoyable.

When responding to package upload events:
- For SUCCESS: Be enthusiastic but not over-the-top. Celebrate the achievement briefly and guide next steps.
- For ERRORS: Be empathetic and helpful. Explain what went wrong in simple terms and suggest fixes. Use light humor to soften the frustration.

Keep responses concise (2-3 sentences max). Never use emojis. Reference the package name when relevant.
Your goal is to make the user feel supported and to turn even error messages into a positive experience.`;
  }

  private buildUserPrompt(context: UploadNarratorContext): string {
    if (context.success) {
      return `Generate a success message for uploading a PRET package.
Package name: "${context.packageName}"
Package ID: ${context.packageId}

The user can now view and edit the package contents. Mention they can ask you to make changes to the package.`;
    }

    const errorDetails = context.validationErrors?.length 
      ? `Validation errors: ${context.validationErrors.join(', ')}`
      : `Error: ${context.error || 'Unknown error occurred'}`;

    return `Generate a helpful error message for a failed PRET package upload.
Package name: "${context.packageName}"
${errorDetails}

Help the user understand what went wrong and how to fix it.`;
  }

  private getFallbackResponse(context: UploadNarratorContext): NarratorResponse {
    if (context.success) {
      return {
        message: `Successfully imported "${context.packageName}". You can now view and edit its contents in the Package Editor. Ask me to make any changes to the package.`,
        tone: 'success',
      };
    }

    const errorMsg = context.validationErrors?.join(', ') || context.error || 'Unknown error';
    return {
      message: `Failed to import package: ${errorMsg}. Please check the package structure and try again.`,
      tone: 'error',
    };
  }
}
