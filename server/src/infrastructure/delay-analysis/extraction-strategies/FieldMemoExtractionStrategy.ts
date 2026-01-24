import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

const FIELD_MEMO_EXTRACTION_PROMPT = `You are an expert construction delay analyst specializing in Field Memos and general project correspondence.

DOCUMENT TYPE: Field Memo
CONTEXT: Field memos are broader, less structured documents that may contain delay-related information. They often document issues, decisions, or incidents that could indicate contractor-caused delays.

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
- VERIFY RESPONSIBILITY: Ensure the delay is contractor-caused, not owner-directed or external
- DURATION: Extract or estimate duration when possible

For each delay event found, extract:
- eventDescription: Clear description of the delay event
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other
- eventDate: The date of the event if mentioned (YYYY-MM-DD format)
- impactDurationHours: Estimated hours of impact if determinable
- sourceReference: The section/paragraph where this was found
- extractedFromCode: "FIELD_MEMO" or any specific reference code found
- confidenceScore: Your confidence this is a real contractor delay (0.0-1.0)

Return a JSON array of extracted events. If no delays are found, return an empty array.

Document content:
`;

export class FieldMemoExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'field_memo';
  readonly strategyName: string = 'Field Memo Extraction Strategy';

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    
    return {
      prompt: FIELD_MEMO_EXTRACTION_PROMPT + truncatedContent,
      baseConfidence: 0.5,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
    };
  }
}
