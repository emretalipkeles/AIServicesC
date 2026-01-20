import type { 
  ChatRequestDto, 
  ChatResponseDto, 
  TestConnectionRequestDto, 
  TestConnectionResponseDto,
  StreamEventDto 
} from '../dto/AIDto';

export interface IAIService {
  chat(request: ChatRequestDto): Promise<ChatResponseDto>;
  
  streamChat(
    request: ChatRequestDto,
    onEvent: (event: StreamEventDto) => void
  ): Promise<void>;
  
  testConnection(request?: TestConnectionRequestDto): Promise<TestConnectionResponseDto>;
  
  isConfigured(): boolean;
  
  getAvailableModels(): string[];
}
