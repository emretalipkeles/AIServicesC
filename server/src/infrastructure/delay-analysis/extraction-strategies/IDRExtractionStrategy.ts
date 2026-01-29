import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

const IDR_EXTRACTION_PROMPT = `You are an expert construction delay analyst specializing in Inspector Daily Reports (IDRs).

DOCUMENT TYPE: Inspector Daily Report (IDR)
CONTEXT: IDRs are daily field observations written by inspectors. They capture what's happening on site day-to-day. Inspectors flag potential contractor delays with code "CODE_CIE" (Contractor Initiated Events).

YOUR TASK: Analyze this IDR and extract contractor-caused delay events. IDR entries may require interpretation - the inspector's observation suggests a delay but may not state it definitively.

EXTRACTION PRIORITIES (in order):
1. CODE_CIE tagged entries - These are explicitly flagged contractor delays (HIGHEST PRIORITY)
2. Delays caused by contractor actions or inaction
3. Work stoppages due to contractor issues (equipment breakdown, crew problems)
4. Material or equipment delays from contractor
5. Subcontractor coordination failures
6. Quality issues observed that may require rework

**CRITICAL: extractedFromCode FIELD RULES**
This is the MOST IMPORTANT field for IDR documents. You MUST follow these rules exactly:

1. If the delay was identified from a CODE_CIE entry in the document:
   - Set extractedFromCode to EXACTLY "CODE_CIE"
   - Do NOT use "IDR_OBSERVATION" for CODE_CIE entries

2. If the delay was identified from general narrative observation (NOT tagged with CODE_CIE):
   - Set extractedFromCode to "IDR_OBSERVATION"

EXAMPLES:
- Document says "CODE_CIE: Crew arrived 2 hours late" → extractedFromCode: "CODE_CIE"
- Document has section labeled "CIE" or "Contractor Issues" with CODE_CIE tag → extractedFromCode: "CODE_CIE"
- Document mentions "equipment breakdown noted" without CODE_CIE tag → extractedFromCode: "IDR_OBSERVATION"

CRITICAL ANALYSIS REQUIREMENTS:
- CONFIDENCE SCORING: Since IDR observations are subjective, you must assess:
  * Is this really a delay event or routine observation?
  * Is the contractor clearly responsible, or is it ambiguous?
  * Can delay duration be determined from the narrative?
- DURATION ESTIMATION: IDRs often describe incidents without stating exact delay duration.
  * Estimate hours of impact when possible (e.g., "crew arrived 2 hours late" = 2 hours)
  * If duration is unclear, provide your best estimate based on the incident description
- RESPONSIBILITY VERIFICATION: Analyze the narrative to confirm contractor responsibility
  * Some CODE_CIE entries might be false positives
  * Look for clear contractor-caused issues vs. external factors

For each delay event found, extract:
- eventDescription: Clear description of the delay event
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other
- eventDate: The date of the event if mentioned (YYYY-MM-DD format)
- impactDurationHours: Estimated hours of impact (required - estimate if not explicit)
- sourceReference: The section/paragraph where this was found
- extractedFromCode: MUST be "CODE_CIE" if from a CODE_CIE entry, otherwise "IDR_OBSERVATION" - THIS IS CRITICAL
- confidenceScore: Your confidence this is a real contractor delay (0.0-1.0)
- responsibilityConfirmed: Boolean - is contractor responsibility clear from narrative?

Return a JSON array of extracted events. If no delays are found, return an empty array.

Document content:
`;

export class IDRExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'idr';
  readonly strategyName: string = 'IDR Extraction Strategy';

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    
    return {
      prompt: IDR_EXTRACTION_PROMPT + truncatedContent,
      baseConfidence: 0.6,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
    };
  }
}
