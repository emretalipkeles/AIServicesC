import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import { renderDelayEventOutputFormatBlock } from '../../../domain/delay-analysis/DelayEventExtractionContract';

export class FieldMemoExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'field_memo';
  readonly strategyName: string = 'Field Memo Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = context.skipKnowledgeBase
      ? ''
      : this.knowledgePromptBuilder.buildPromptForDocumentType('field_memo');

    const knowledgeBaseSection = knowledgeBasePrompt
      ? `\n${knowledgeBasePrompt}\n`
      : '\n(Knowledge base provided in system prompt - refer to it for delay definitions, categories, exclusions, decision framework, worked examples, and gray areas.)\n';

    const prompt = `You are an expert construction delay analyst specializing in Field Memos and general project correspondence.

DOCUMENT TYPE: Field Memo
CONTEXT: Field memos are broader, less structured documents that may contain delay-related information. They often document issues, decisions, or incidents that could indicate contractor-caused delays.
${knowledgeBaseSection}
=============================================================================
EXTRACTION INSTRUCTIONS
=============================================================================

YOUR TASK: Analyze this field memo and extract any contractor-caused delay events. Field memos require careful interpretation as they are less structured than IDRs or NCRs.

EXTRACTION PRIORITIES (in order):
1. Explicit mentions of delays, schedule impacts, or work stoppages
2. Issues attributed to contractor performance
3. Quality problems or rework requirements
4. Coordination failures
5. Resource or equipment issues caused by contractor

CRITICAL ANALYSIS REQUIREMENTS:
- MODERATE CONFIDENCE: Field memos vary widely in specificity
- INTERPRET CAREFULLY: Look for implied delays, not just explicit mentions
- VERIFY RESPONSIBILITY: Ensure the delay is contractor-caused, not owner-directed or external. Apply the exclusions and decision framework from the knowledge base.
- DURATION: Extract or estimate duration when possible

${renderDelayEventOutputFormatBlock({
  impactDurationHours: 'number (estimate based on scope when not explicitly stated)',
  durationBasis: "estimated when inferred from scope; document_stated when explicitly written; never bounded_by_next_entry — Field Memos are directives, not timestamped narratives",
  fallbackEstimateHours: 'omit/null — Field Memos never use bounded_by_next_entry',
  sourceReference: '"the section/paragraph where this was found"',
  extractedFromCode: '"FIELD_MEMO" or any specific reference code found',
})}

If no delays are found, return an empty delayEvents array.

Document content:
${truncatedContent}`;

    return {
      prompt,
      baseConfidence: 0.5,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
    };
  }
}
