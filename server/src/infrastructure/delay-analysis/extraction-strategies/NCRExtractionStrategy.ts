import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class NCRExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'ncr';
  readonly strategyName: string = 'NCR Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = this.knowledgePromptBuilder.buildPromptForDocumentType('ncr');

    const prompt = `You are an expert construction delay analyst specializing in Non-Conformance Reports (NCRs).

DOCUMENT TYPE: Non-Conformance Report (NCR)
CONTEXT: NCRs are formal documentation of quality failures or work that doesn't meet specifications. NCRs trigger mandatory rework or corrective action. An NCR = work failed = rework required = DEFINITE delay.

${knowledgeBasePrompt}

=============================================================================
EXTRACTION INSTRUCTIONS
=============================================================================

YOUR TASK: Extract delay events from this NCR. NCRs are high-confidence delay indicators because:
- Work failed inspection, requiring rework
- Contractor is responsible for quality failures (unless proven to be a design defect)
- NCRs document definite delays, though duration may need to be determined separately

EXTRACTION PRIORITIES (in order):
1. NCR identification (NCR number, date, referenced work)
2. What failed inspection (the defect/non-conformance)
3. Corrective action required (what must be redone)
4. Rework scope (only capture duration if explicitly stated in the document)
5. Any referenced activities, WBS codes, or work areas

CRITICAL ANALYSIS REQUIREMENTS:
- TREAT AS DEFINITIVE DELAY: NCR = documented failure = delay is certain
- EXTRACT REWORK SCOPE: What failed and what corrective action is required
- DURATION: DO NOT ESTIMATE duration. Only extract duration if explicitly stated in the document.
  * If the NCR explicitly mentions hours, days, or duration estimate, capture that value
  * If no duration is mentioned, leave impactDurationHours as null/empty
  * Never calculate or estimate duration from the scope of work
- RESPONSIBILITY: Almost always contractor-caused UNLESS the NCR indicates:
  * Design defect
  * Owner-directed change
  * Third-party damage
  (Per the exclusions in the knowledge base above)

For each delay event found, extract:
- eventDescription: Clear description including what failed and corrective action
- eventCategory: One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other (most NCRs should be quality_rework)
- eventDate: The date of the NCR or incident (YYYY-MM-DD format)
- impactDurationHours: Only include if explicitly stated in the NCR document. Leave null/empty if not mentioned. DO NOT estimate.
- sourceReference: MUST include NCR/DSC number (e.g., 'NCR-045', 'DSC 293') AND section reference
- extractedFromCode: The NCR number (e.g., "NCR-045")
- confidenceScore: Your confidence this causes delay (typically 0.85-1.0 for NCRs)
- delayEventConfidence: Your confidence that this is truly a delay event (0.0-1.0). For NCRs, this should typically be 0.85-1.0 since NCRs document definite quality failures requiring corrective action.
- reworkDescription: Specific corrective action required

Return a JSON array of extracted events. If no delays are found (rare for NCRs), return an empty array.

Document content:
${truncatedContent}`;

    return {
      prompt,
      baseConfidence: 0.85,
      requiresNarrativeVerification: false,
      delayIsCertain: true,
    };
  }
}
