import type { IDocumentExtractionStrategyFactory } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategyFactory';
import type { IDocumentExtractionStrategy } from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

import { IDRExtractionStrategy } from './IDRExtractionStrategy';
import { NCRExtractionStrategy } from './NCRExtractionStrategy';
import { FieldMemoExtractionStrategy } from './FieldMemoExtractionStrategy';
import { DefaultExtractionStrategy } from './DefaultExtractionStrategy';

export class DocumentExtractionStrategyFactory implements IDocumentExtractionStrategyFactory {
  private readonly strategies: Map<ProjectDocumentType, IDocumentExtractionStrategy>;
  private readonly defaultStrategy: IDocumentExtractionStrategy;

  constructor() {
    this.defaultStrategy = new DefaultExtractionStrategy();
    
    this.strategies = new Map<ProjectDocumentType, IDocumentExtractionStrategy>([
      ['idr', new IDRExtractionStrategy()],
      ['ncr', new NCRExtractionStrategy()],
      ['field_memo', new FieldMemoExtractionStrategy()],
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
