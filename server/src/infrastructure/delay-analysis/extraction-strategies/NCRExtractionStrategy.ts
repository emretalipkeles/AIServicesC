import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';
import { renderDelayEventOutputFormatBlock } from '../../../domain/delay-analysis/DelayEventExtractionContract';

export class NCRExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'ncr';
  readonly strategyName: string = 'NCR Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = context.skipKnowledgeBase
      ? ''
      : this.knowledgePromptBuilder.buildPromptForDocumentType('ncr');

    const knowledgeBaseSection = knowledgeBasePrompt
      ? `\n${knowledgeBasePrompt}\n`
      : '\n(Knowledge base provided in system prompt - refer to it for delay definitions, categories, exclusions, decision framework, worked examples, and gray areas.)\n';

    const prompt = `You are an expert construction delay analyst specializing in Non-Conformance Reports (NCRs).

DOCUMENT TYPE: Non-Conformance Report (NCR)
CONTEXT: NCRs are formal documentation of quality failures or work that doesn't meet specifications. NCRs trigger mandatory rework or corrective action. An NCR = work failed = rework required = DEFINITE delay.
${knowledgeBaseSection}
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

${renderDelayEventOutputFormatBlock({
  eventDate: '"YYYY-MM-DD (the NCR or incident date)"',
  impactDurationHours: 'null (only include if explicitly stated in the NCR document — DO NOT estimate)',
  durationBasis: "document_stated if a duration was explicitly written, otherwise null — NEVER 'estimated' or 'bounded_by_next_entry' for NCRs",
  fallbackEstimateHours: 'omit/null — NCRs never use bounded_by_next_entry',
  sourceReference: '"MUST include NCR/DSC number (e.g., \'NCR-045\', \'DSC 293\') AND section reference"',
  extractedFromCode: '"the NCR number (e.g., \'NCR-045\')"',
  confidenceScore: '0.85-1.0 (NCRs are high confidence)',
  delayEventConfidence: '0.85-1.0 (NCRs document definite quality failures requiring corrective action)',
  reworkDescription: '"specific corrective action required"',
})}

If no delays are found (rare for NCRs), return an empty delayEvents array.

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
