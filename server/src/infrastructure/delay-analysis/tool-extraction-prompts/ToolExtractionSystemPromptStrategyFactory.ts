import type { IToolExtractionSystemPromptStrategy, IToolExtractionSystemPromptStrategyFactory } from '../../../domain/delay-analysis/interfaces/IToolExtractionSystemPromptStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import { IDRToolExtractionSystemPromptStrategy } from './IDRToolExtractionSystemPromptStrategy';
import { FieldMemoToolExtractionSystemPromptStrategy } from './FieldMemoToolExtractionSystemPromptStrategy';
import { NCRToolExtractionSystemPromptStrategy } from './NCRToolExtractionSystemPromptStrategy';
import { DefaultToolExtractionSystemPromptStrategy } from './DefaultToolExtractionSystemPromptStrategy';

export class ToolExtractionSystemPromptStrategyFactory implements IToolExtractionSystemPromptStrategyFactory {
  private readonly strategies: Map<ProjectDocumentType, IToolExtractionSystemPromptStrategy>;
  private readonly defaultStrategy: IToolExtractionSystemPromptStrategy;

  constructor(knowledgePromptBuilder: DelayKnowledgePromptBuilder) {
    this.defaultStrategy = new DefaultToolExtractionSystemPromptStrategy(knowledgePromptBuilder);

    this.strategies = new Map<ProjectDocumentType, IToolExtractionSystemPromptStrategy>([
      ['idr', new IDRToolExtractionSystemPromptStrategy(knowledgePromptBuilder)],
      ['field_memo', new FieldMemoToolExtractionSystemPromptStrategy(knowledgePromptBuilder)],
      ['ncr', new NCRToolExtractionSystemPromptStrategy(knowledgePromptBuilder)],
    ]);
  }

  getStrategy(documentType: ProjectDocumentType): IToolExtractionSystemPromptStrategy {
    const strategy = this.strategies.get(documentType);
    if (strategy) {
      return strategy;
    }
    return this.defaultStrategy;
  }
}
