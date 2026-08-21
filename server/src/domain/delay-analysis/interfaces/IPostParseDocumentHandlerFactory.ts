import type { IPostParseDocumentHandler } from './IPostParseDocumentHandler';

export interface IPostParseDocumentHandlerFactory {
  getHandler(documentType: string): IPostParseDocumentHandler | null;
}
