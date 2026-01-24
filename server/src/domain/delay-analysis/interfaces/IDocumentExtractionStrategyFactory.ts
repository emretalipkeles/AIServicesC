import type { ProjectDocumentType } from '../entities/ProjectDocument';
import type { IDocumentExtractionStrategy } from './IDocumentExtractionStrategy';

export interface IDocumentExtractionStrategyFactory {
  getStrategy(documentType: ProjectDocumentType): IDocumentExtractionStrategy;
}
