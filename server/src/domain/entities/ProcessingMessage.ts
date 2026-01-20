export type MessageRole = 'user' | 'assistant' | 'system';

export interface ProcessingMessageProps {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  chunkIndex: number | null;
  createdAt: Date;
}

export class ProcessingMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly chunkIndex: number | null;
  readonly createdAt: Date;

  constructor(props: ProcessingMessageProps) {
    this.id = props.id;
    this.sessionId = props.sessionId;
    this.role = props.role;
    this.content = props.content;
    this.chunkIndex = props.chunkIndex;
    this.createdAt = props.createdAt;
  }

  static createChunkMessage(
    id: string,
    sessionId: string,
    chunkIndex: number,
    content: string
  ): ProcessingMessage {
    return new ProcessingMessage({
      id,
      sessionId,
      role: 'user',
      content,
      chunkIndex,
      createdAt: new Date(),
    });
  }

  static createAssistantResponse(
    id: string,
    sessionId: string,
    content: string,
    chunkIndex?: number
  ): ProcessingMessage {
    return new ProcessingMessage({
      id,
      sessionId,
      role: 'assistant',
      content,
      chunkIndex: chunkIndex ?? null,
      createdAt: new Date(),
    });
  }
}
