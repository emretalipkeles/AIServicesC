export interface ChatMessageDto {
  role: 'user' | 'assistant';
  content: string;
}

export interface DelayEventsChatResponseDto {
  response: string;
  isRefusal: boolean;
}
