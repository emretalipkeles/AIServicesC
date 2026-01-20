import { ValidationError } from '../errors/DomainError';

export type MessageRole = 'user' | 'assistant';

export interface AIMessageProps {
  role: MessageRole;
  content: string;
}

export class AIMessage {
  private readonly _role: MessageRole;
  private readonly _content: string;

  constructor(props: AIMessageProps) {
    if (!props.role || !['user', 'assistant'].includes(props.role)) {
      throw new ValidationError('Message role must be "user" or "assistant"');
    }
    if (!props.content || props.content.trim().length === 0) {
      throw new ValidationError('Message content cannot be empty');
    }
    this._role = props.role;
    this._content = props.content.trim();
  }

  static user(content: string): AIMessage {
    return new AIMessage({ role: 'user', content });
  }

  static assistant(content: string): AIMessage {
    return new AIMessage({ role: 'assistant', content });
  }

  get role(): MessageRole {
    return this._role;
  }

  get content(): string {
    return this._content;
  }

  toJSON(): AIMessageProps {
    return {
      role: this._role,
      content: this._content,
    };
  }

  equals(other: AIMessage): boolean {
    return this._role === other._role && this._content === other._content;
  }
}
