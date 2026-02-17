import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';
import type { DelayKnowledgePromptBuilder } from '../DelayKnowledgePromptBuilder';

export class IDRExtractionStrategy implements IDocumentExtractionStrategy {
  readonly documentType: ProjectDocumentType = 'idr';
  readonly strategyName: string = 'IDR Extraction Strategy';

  constructor(private readonly knowledgePromptBuilder: DelayKnowledgePromptBuilder) {}

  buildExtractionPrompt(context: DocumentExtractionContext): ExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);
    const knowledgeBasePrompt = this.knowledgePromptBuilder.buildPromptForDocumentType('idr');

    const prompt = `You are an expert construction delay analyst specializing in Inspector Daily Reports (IDRs).

DOCUMENT TYPE: Inspector Daily Report (IDR)
CONTEXT: IDRs are daily field observations written by inspectors. They capture what's happening on site day-to-day. Inspectors flag potential contractor delays with code "CODE_CIE" (Contractor Initiated Events).

${knowledgeBasePrompt}

=============================================================================
YOUR TASK: Analyze this IDR and extract TWO things:
1. **Contractor's Work Activity** - The schedule activities listed in the "Contractor's Work Activity" table (if present)
2. **Delay Events** - Contractor-caused delay events from the document
=============================================================================

PART 1: EXTRACT CONTRACTOR'S WORK ACTIVITY TABLE

Many IDRs contain a "Contractor's Work Activity" section/table that lists the schedule activities being worked on that day. This table typically has columns like:
- Schedule Activity # (e.g., "2-W-0471", "3-W-1042")
- Description (e.g., "Stage 1 WM: Excavate Services")
- Comments (e.g., "WM STA 7+00 to 21+50")

**IMPORTANT**: If you find this table, extract ALL entries. This information is critical for matching delay events to schedule activities efficiently.

=============================================================================
PART 2: EXTRACT DELAY EVENTS
=============================================================================

EXTRACTION PRIORITIES (in order):
1. CODE_CIE tagged entries - These are explicitly flagged contractor delays (HIGHEST PRIORITY)
2. Delays caused by contractor actions or inaction
3. Work stoppages due to contractor issues (equipment breakdown, crew problems)
4. Material or equipment delays from contractor
5. Subcontractor coordination failures
6. Quality issues observed that may require rework

**CRITICAL: extractedFromCode FIELD RULES**
1. If the delay was identified from a CODE_CIE entry in the document:
   - Set extractedFromCode to EXACTLY "CODE_CIE"
2. If the delay was identified from general narrative observation (NOT tagged with CODE_CIE):
   - Set extractedFromCode to "IDR_OBSERVATION"

EXAMPLES:
- Document says "CODE_CIE: Crew arrived 2 hours late" → extractedFromCode: "CODE_CIE"
- Document has section labeled "CIE" or "Contractor Issues" with CODE_CIE tag → extractedFromCode: "CODE_CIE"
- Document mentions "equipment breakdown noted" without CODE_CIE tag → extractedFromCode: "IDR_OBSERVATION"

CRITICAL ANALYSIS REQUIREMENTS:
- CONFIDENCE SCORING: Since IDR observations are subjective, you must assess:
  * Is this really a delay event or routine observation? Apply the knowledge base decision framework.
  * Is the contractor clearly responsible, or is it ambiguous? Check the exclusions list.
  * Can delay duration be determined from the narrative?
- DURATION ESTIMATION (REQUIRED): You MUST provide impactDurationHours for EVERY delay event.
  * If explicitly stated (e.g., "1.5 hour"): use that value
  * If timestamps show start/end: calculate the difference
  * If waiting on direction: estimate 2-4 hours minimum
  * If unclear: provide your best estimate (minimum 0.5h) - NEVER leave duration null
- RESPONSIBILITY VERIFICATION: Analyze the narrative to confirm contractor responsibility
  * Some CODE_CIE entries might be false positives
  * Look for clear contractor-caused issues vs. external factors
  * Apply the exclusions from the knowledge base - DSCs, owner-directed suspensions, etc.

=============================================================================
DIARY SECTION ANALYSIS (IMPORTANT)
=============================================================================

IDRs contain "Diary" sections with timestamped narrative entries. These are CRITICAL sources of delay information that you MUST analyze carefully.

**DIARY FORMAT:**
Diary entries typically look like:
- "Diary - [Inspector Name]" or "Diary – [Crew Name]"
- Followed by timestamped entries throughout the day

**TIME FORMATS TO RECOGNIZE:**
Inspectors use various formats: 0700, 07:00, 7:00, 7am, 7:00 AM, 7 AM, 0700hrs

**DURATION CALCULATION FROM TIMESTAMPS:**
When diary entries show work stoppage and resumption, CALCULATE the delay duration:
- Example: "0700 - crew stopped work, machine not running" ... "0830 - crew resumed after repair"
  → Delay duration = 1.5 hours (from 07:00 to 08:30)
- Example: "1415 - excavation stopped due to tree roots (DSC 295)" ... "1500 - work resumed"
  → Delay duration = 0.75 hours (45 minutes)

**WHAT TO EXTRACT FROM DIARY:**
1. Work stoppages with timestamps (calculate duration from time gaps)
2. DSC references mentioned in diary (e.g., "DSC 293", "DSC 295")
3. Equipment breakdowns, crew delays, material issues
4. Coordination problems noted by inspector
5. Quality issues that halted work

**SOURCE REFERENCE FORMAT FOR DIARY ENTRIES:**
Include the timestamp in sourceReference: "Diary, 1415: [brief description]" or "Diary 0800-0930: [description]"

=============================================================================
DELAY EVENT CONFIDENCE ASSESSMENT
=============================================================================

For each delay event you extract, assess your confidence that this is truly a delay event (not a routine observation or normal progress note). Use the knowledge base above including:
- The core test: Was the Contractor doing everything within its power to diligently prosecute the Work?
- The delay categories and what to look for
- The exclusions list (what is NOT a contractor delay)
- The decision framework (if-yes/if-no logic)
- The worked examples for reference
- The gray area scenarios for borderline cases

Set "delayEventConfidence" as a number between 0.0 and 1.0 for each event.

=============================================================================
RESPONSE FORMAT
=============================================================================

Return a JSON object with TWO arrays:

{
  "workActivities": [
    {
      "activityId": "2-W-0471",
      "description": "Stage 1 WM: Excavate Services",
      "comments": "WM STA 7+00 to 21+50"
    }
  ],
  "delayEvents": [
    {
      "eventDescription": "Clear description of the delay event",
      "eventCategory": "One of: planning_mobilization, labor_related, materials_equipment, subcontractor_coordination, quality_rework, site_management_safety, utility_infrastructure, other",
      "eventDate": "YYYY-MM-DD",
      "impactDurationHours": 2.0 (REQUIRED - always provide a number, never null),
      "sourceReference": "MUST include DSC/NCR number if mentioned (e.g., 'DSC 293: Page 2'). Format: 'DSC XXX' + location",
      "extractedFromCode": "CODE_CIE or IDR_OBSERVATION",
      "confidenceScore": 0.85,
      "delayEventConfidence": 0.85,
      "responsibilityConfirmed": true
    }
  ]
}

NOTES:
- workActivities: Extract from "Contractor's Work Activity" table. Return empty array [] if no such table exists.
- delayEvents: Extract delay events as described above. Return empty array [] if no delays are found.

Document content:
${truncatedContent}`;

    return {
      prompt,
      baseConfidence: 0.6,
      requiresNarrativeVerification: true,
      delayIsCertain: false,
      extractWorkActivities: true,
    };
  }
}
