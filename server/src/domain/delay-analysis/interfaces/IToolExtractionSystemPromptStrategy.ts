import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface IToolExtractionSystemPromptStrategy {
  readonly documentType: ProjectDocumentType;
  readonly strategyName: string;
  /**
   * @param documentContent Optional raw document text for the call this system prompt is
   * being built for. Strategies whose knowledge-base injection can be scoped to what the
   * document actually raises (see DelayKnowledgePromptBuilder) use it to prune sections;
   * strategies that don't need it may ignore the parameter.
   */
  buildSystemPrompt(documentContent?: string): string;
  buildUserPromptSuffix(): string;
}

export interface IToolExtractionSystemPromptStrategyFactory {
  getStrategy(documentType: ProjectDocumentType): IToolExtractionSystemPromptStrategy;
}
