/**
 * AI-fallback extraction strategy interface for Foreman Diaries, used only when the
 * deterministic DiarySegmenter's confidence signal indicates the layout didn't match.
 * Deliberately its own narrow interface (mirroring IPodExtractionStrategy) rather than
 * IDocumentExtractionStrategy: diary extraction has no delay-confidence concept to report,
 * and its job is the same day/author/note dated-entry shape the segmenter produces.
 */
export interface DiaryExtractionContext {
  /** One chunk of the diary's assembled text (long diaries are chunked to stay within model limits). */
  documentContent: string;
  documentFilename: string;
  documentId: string;
}

export interface DiaryExtractionStrategyResult {
  prompt: string;
}

export interface IDiaryExtractionStrategy {
  buildExtractionPrompt(context: DiaryExtractionContext): DiaryExtractionStrategyResult;
}
