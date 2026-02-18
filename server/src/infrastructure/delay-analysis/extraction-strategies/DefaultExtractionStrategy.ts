import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

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

For each delay event found, extract:
- eventDescription: Clear description of the delay event
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other
- eventDate: The date of the event if mentioned (YYYY-MM-DD format)
- impactDurationHours: Estimated hours of impact if mentioned
- sourceReference: Include DSC/NCR/RFI number if mentioned (e.g., 'DSC 293') AND page/section reference
- extractedFromCode: Any delay code if present, otherwise "GENERAL"
- confidenceScore: Your confidence this is a real contractor delay (0.0-1.0)
- delayEventConfidence: Your confidence that this is truly a delay event vs. a routine observation (0.0-1.0). Use the knowledge base categories, exclusions, and decision framework to assess.

Return a JSON array of extracted events. If no delays are found, return an empty array.

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
