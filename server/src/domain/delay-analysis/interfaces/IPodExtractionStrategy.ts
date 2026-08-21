/**
 * POD's own extraction-strategy interface. Deliberately not IDocumentExtractionStrategy:
 * that interface's confidence metadata (baseConfidence, delayIsCertain,
 * requiresNarrativeVerification) is delay-event-specific and has no meaning for POD, whose
 * job is structural chunking (which lines are headings/crew/equipment/task lines), not
 * delay narrative interpretation.
 */
export interface PodExtractionContext {
  documentContent: string;
  documentFilename: string;
  documentId: string;
}

export interface PodExtractionStrategyResult {
  prompt: string;
}

export interface IPodExtractionStrategy {
  buildExtractionPrompt(context: PodExtractionContext): PodExtractionStrategyResult;
}
