import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import { renderDelayEventOutputFormatBlock } from '../../../domain/delay-analysis/DelayEventExtractionContract';

export class DefaultExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'other';
  readonly strategyName: string = 'Default Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = context.skipKnowledgeBase
      ? ''
      : this.knowledgePromptBuilder.buildPromptForDocumentType('other');

    const knowledgeBaseSection = knowledgeBasePrompt
      ? `\n${knowledgeBasePrompt}\n`
      : '\n(Knowledge base provided in system prompt - refer to it for delay definitions, categories, exclusions, decision framework, worked examples, and gray areas.)\n';

    const prompt = `You are an expert construction delay analyst. Analyze the following document and extract any contractor-caused delay events.
${knowledgeBaseSection}
=============================================================================
EXTRACTION INSTRUCTIONS
=============================================================================

Using the knowledge base, analyze the document and extract delay events.

${renderDelayEventOutputFormatBlock()}

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
