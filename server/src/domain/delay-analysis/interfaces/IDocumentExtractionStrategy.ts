import type { ProjectDocumentType } from '../entities/ProjectDocument';

export interface DocumentExtractionContext {
  documentContent: string;
  documentFilename: string;
  documentId: string;
  documentType: ProjectDocumentType;
  skipKnowledgeBase?: boolean;
  fieldMemoContext?: string;
  /**
   * True when this prompt is being embedded into the user message of a tool-based
   * extraction call that already carries a matching *ToolExtractionSystemPromptStrategy
   * system message (see AIDelayEventExtractorWithTools). Strategies that have a system-prompt
   * counterpart use this to omit the rules and document-content copy already delivered by the
   * system message, instead of restating them in different wording. When false/undefined, the
   * strategy must remain fully self-contained (used standalone by AIDelayEventExtractor).
   */
  toolBasedExtraction?: boolean;
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
