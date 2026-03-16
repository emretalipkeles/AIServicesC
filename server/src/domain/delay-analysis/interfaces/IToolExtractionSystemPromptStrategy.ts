import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface IToolExtractionSystemPromptStrategy {
  readonly documentType: ProjectDocumentType;
  readonly strategyName: string;
  buildSystemPrompt(): string;
  buildUserPromptSuffix(): string;
}

export interface IToolExtractionSystemPromptStrategyFactory {
  getStrategy(documentType: ProjectDocumentType): IToolExtractionSystemPromptStrategy;
}
