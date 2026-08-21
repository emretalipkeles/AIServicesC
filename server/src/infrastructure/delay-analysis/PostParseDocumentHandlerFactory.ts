import type { IPostParseDocumentHandler } from '../../domain/delay-analysis/interfaces/IPostParseDocumentHandler';
import type { IPostParseDocumentHandlerFactory } from '../../domain/delay-analysis/interfaces/IPostParseDocumentHandlerFactory';

export class PostParseDocumentHandlerFactory implements IPostParseDocumentHandlerFactory {
  constructor(private readonly handlers: IPostParseDocumentHandler[]) {}

  getHandler(documentType: string): IPostParseDocumentHandler | null {
    return this.handlers.find(handler => handler.canHandle(documentType)) ?? null;
  }
}
