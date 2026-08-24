export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = 'Unauthorized access') {
    super(message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(rule: string, details?: string) {
    super(details ? `${rule}: ${details}` : rule);
  }
}

/**
 * Raised when an AI provider stops generating because it hit the completion token
 * budget (finish_reason === 'length') rather than finishing naturally. On reasoning
 * models, reasoning tokens are drawn from the same budget as visible output, so this
 * can happen well before any usable content (or a complete JSON payload) was written.
 * Callers must surface this as a failure instead of parsing/returning whatever partial
 * content came back — a short or unparseable event list is otherwise indistinguishable
 * from a genuine "nothing found" result.
 */
export class AIResponseTruncatedError extends DomainError {
  constructor(context: string, maxTokens: number) {
    super(`${context}: AI response was truncated (finish_reason=length) at max_completion_tokens=${maxTokens}. Increase the token budget or reduce input size.`);
  }
}
