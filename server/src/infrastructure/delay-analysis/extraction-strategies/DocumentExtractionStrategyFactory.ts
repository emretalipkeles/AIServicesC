import type { IDocumentExtractionStrategyFactory } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategyFactory';
import type { IDocumentExtractionStrategy } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import { ContractorDelayTrainingGuide } from '../../../domain/delay-analysis/config/ContractorDelayTrainingGuide';
import { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

import { IDRExtractionStrategy } from './IDRExtractionStrategy';
import { NCRExtractionStrategy } from './NCRExtractionStrategy';
import { FieldMemoExtractionStrategy } from './FieldMemoExtractionStrategy';
import { DefaultExtractionStrategy } from './DefaultExtractionStrategy';

export class DocumentExtractionStrategyFactory implements IDocumentExtractionStrategyFactory {
  private readonly strategies: Map<ProjectDocumentType, IDocumentExtractionStrategy>;
  private readonly defaultStrategy: IDocumentExtractionStrategy;

  constructor(knowledgePromptBuilder?: DelayKnowledgePromptBuilder) {
    const builder = knowledgePromptBuilder ?? new DelayKnowledgePromptBuilder(new ContractorDelayTrainingGuide());

    this.defaultStrategy = new DefaultExtractionStrategy(builder);
    
    this.strategies = new Map<ProjectDocumentType, IDocumentExtractionStrategy>([
      ['idr', new IDRExtractionStrategy(builder)],
      ['ncr', new NCRExtractionStrategy(builder)],
      ['field_memo', new FieldMemoExtractionStrategy(builder)],
    ]);
  }

  getStrategy(documentType: ProjectDocumentType): IDocumentExtractionStrategy {
    const strategy = this.strategies.get(documentType);
    
    if (strategy) {
      return strategy;
    }
    
    return this.defaultStrategy;
  }
}
