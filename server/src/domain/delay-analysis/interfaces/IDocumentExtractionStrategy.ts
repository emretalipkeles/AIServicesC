import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface DocumentExtractionContext {
  documentContent: string;
  documentFilename: string;
  documentId: string;
  documentType: ProjectDocumentType;
}

export interface ExtractionStrategyResult {
  prompt: string;
  baseConfidence: number;
  requiresNarrativeVerification: boolean;
  delayIsCertain: boolean;
}

export interface IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType;
  readonly strategyName: string;
  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult;
}
