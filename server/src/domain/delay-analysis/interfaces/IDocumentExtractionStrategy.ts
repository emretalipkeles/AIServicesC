import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface DocumentExtractionContext {
  documentContent: string;
  documentFilename: string;
  documentId: string;
  documentType: ProjectDocumentType;
  skipKnowledgeBase?: boolean;
}

/**
 * Represents an activity listed in the IDR's "Contractor's Work Activity" section.
 * These are the schedule activities the inspector recorded as being worked on that day.
 */
export interface IDRWorkActivity {
  activityId: string;
  description: string;
  comments?: string;
}

export interface ExtractionStrategyResult {
  prompt: string;
  baseConfidence: number;
  requiresNarrativeVerification: boolean;
  delayIsCertain: boolean;
  /**
   * If true, the AI should also extract IDR work activities from the document.
   * This enables fast-path matching for IDR documents.
   */
  extractWorkActivities?: boolean;
}

export interface IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType;
  readonly strategyName: string;
  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult;
}
