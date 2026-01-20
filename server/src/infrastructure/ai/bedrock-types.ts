export interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface BedrockRequestBody {
  anthropic_version: string;
  max_tokens: number;
  messages: BedrockMessage[];
  system?: string;
  temperature?: number;
}

export interface BedrockResponseBody {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface BedrockStreamEvent {
  type: string;
  message?: {
    id: string;
    type: string;
    role: string;
    model: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  index?: number;
  content_block?: {
    type: string;
    text: string;
  };
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
  usage?: {
    output_tokens: number;
  };
}

export interface BedrockConfig {
  region: string;
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export const ANTHROPIC_VERSION = 'bedrock-2023-05-31';
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 1.0;
