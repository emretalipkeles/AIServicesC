import type { 
  IAIClient, 
  ChatOptions, 
  ChatResponse, 
  StreamChunk, 
  StreamOptions,
  TestConnectionResult 
} from '../../domain/interfaces/IAIClient';
import type { ModelId } from '../../domain/value-objects/ModelId';
import type { BedrockRequestBody, BedrockResponseBody } from './bedrock-types';
import { ANTHROPIC_VERSION, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './bedrock-types';

export class BedrockApiKeyClient implements IAIClient {
  private readonly region: string;
  private readonly apiKey: string;

  constructor(config: { region: string; apiKey: string }) {
    this.region = config.region;
    this.apiKey = config.apiKey;
  }

  private getEndpoint(modelId: ModelId): string {
    const inferenceId = modelId.getValue();
    if (modelId.isGlobalProfile()) {
      return `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(inferenceId)}/invoke`;
    }
    return `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(inferenceId)}/invoke`;
  }

  private getStreamEndpoint(modelId: ModelId): string {
    const inferenceId = modelId.getValue();
    return `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(inferenceId)}/invoke-with-response-stream`;
  }

  private buildRequestBody(options: ChatOptions): BedrockRequestBody {
    const body: BedrockRequestBody = {
      anthropic_version: ANTHROPIC_VERSION,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: options.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (options.systemPrompt) {
      body.system = options.systemPrompt;
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    return body;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const endpoint = this.getEndpoint(options.model);
    const body = this.buildRequestBody(options);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bedrock API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as BedrockResponseBody;

    return {
      content: data.content.map(c => c.text).join(''),
      model: data.model,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      stopReason: data.stop_reason,
    };
  }

  async streamChat(
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
    streamOptions?: StreamOptions
  ): Promise<void> {
    const endpoint = this.getStreamEndpoint(options.model);
    const body = this.buildRequestBody(options);

    console.log('[BedrockApiKeyClient] Starting stream to:', endpoint);
    console.log('[BedrockApiKeyClient] Model:', options.model.getValue());

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.amazon.eventstream',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: streamOptions?.abortSignal,
      });
    } catch (fetchError) {
      console.error('[BedrockApiKeyClient] Fetch error:', fetchError);
      if (streamOptions?.abortSignal?.aborted) {
        return;
      }
      onChunk({ type: 'error', error: fetchError instanceof Error ? fetchError.message : 'Fetch failed' });
      return;
    }

    console.log('[BedrockApiKeyClient] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[BedrockApiKeyClient] API error:', response.status, errorText);
      onChunk({ type: 'error', error: `Bedrock API error (${response.status}): ${errorText}` });
      return;
    }

    if (!response.body) {
      onChunk({ type: 'error', error: 'No response body' });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = '';

    console.log('[BedrockApiKeyClient] Starting to read response stream...');

    try {
      while (true) {
        if (streamOptions?.abortSignal?.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        console.log('[BedrockApiKeyClient] Read chunk, done:', done, 'value length:', value?.length);
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // AWS Event Stream format: look for {"bytes":"..."} patterns
        // The bytes field contains base64-encoded JSON
        const bytesRegex = /\{"bytes":"([^"]+)"/g;
        let match;
        let lastMatchEnd = 0;
        
        while ((match = bytesRegex.exec(buffer)) !== null) {
          try {
            const base64Data = match[1];
            const jsonStr = Buffer.from(base64Data, 'base64').toString('utf-8');
            const data = JSON.parse(jsonStr);
            
            if (data.type === 'content_block_delta' && data.delta?.text) {
              onChunk({ type: 'content', content: data.delta.text });
            }
            
            if (data.type === 'message_start' && data.message?.usage) {
              inputTokens = data.message.usage.input_tokens;
            }
            
            if (data.type === 'message_delta' && data.usage) {
              outputTokens = data.usage.output_tokens;
            }
            
            lastMatchEnd = match.index + match[0].length;
          } catch (parseError) {
            // Skip invalid data
          }
        }
        
        // Keep only unprocessed data in buffer
        if (lastMatchEnd > 0) {
          buffer = buffer.substring(lastMatchEnd);
        }
      }

      onChunk({ type: 'done', inputTokens, outputTokens });
    } catch (error) {
      if (streamOptions?.abortSignal?.aborted) {
        return;
      }
      onChunk({ 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Stream error' 
      });
    }
  }

  async testConnection(model: ModelId): Promise<TestConnectionResult> {
    const startTime = Date.now();
    
    try {
      const response = await this.chat({
        model,
        messages: [{ role: 'user', content: 'Hi' } as any],
        maxTokens: 10,
      });

      return {
        success: true,
        authMethod: 'api-key',
        model: response.model,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        authMethod: 'api-key',
        model: model.getValue(),
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getAuthMethod(): 'api-key' | 'iam' {
    return 'api-key';
  }
}
