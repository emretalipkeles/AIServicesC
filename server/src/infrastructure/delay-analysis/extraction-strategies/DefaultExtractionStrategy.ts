import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

const DEFAULT_EXTRACTION_PROMPT = `You are an expert construction delay analyst. Analyze the following document and extract any contractor-caused delay events.

Look specifically for:
1. Delays caused by contractor actions or inaction
2. Work stoppages due to contractor issues
3. Material or equipment delays from contractor
4. Subcontractor coordination failures
5. Quality issues requiring rework

For each delay event found, extract:
- eventDescription: Clear description of the delay event
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other
- eventDate: The date of the event if mentioned (YYYY-MM-DD format)
- impactDurationHours: Estimated hours of impact if mentioned
- sourceReference: The section/paragraph where this was found
- extractedFromCode: Any delay code if present, otherwise "GENERAL"

Return a JSON array of extracted events. If no delays are found, return an empty array.

Document content:
`;

export class DefaultExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'other';
  readonly strategyName: string = 'Default Extraction Strategy';

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    
    return {
      prompt: DEFAULT_EXTRACTION_PROMPT + truncatedContent,
      baseConfidence: 0.5,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
    };
  }
}
