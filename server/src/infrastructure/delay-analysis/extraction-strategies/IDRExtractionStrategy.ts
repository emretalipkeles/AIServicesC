import type { 
  IDocumentExtractionStrategy, 
  DocumentExtractionContext, 
  ExtractionStrategyResult 
} from '../../../domain/delay-analysis/interfaces/IDocumentExtractionStrategy';
import type { ProjectDocumentType } from '../../../domain/delay-analysis/entities/ProjectDocument';

const IDR_EXTRACTION_PROMPT = `You are an expert construction delay analyst specializing in Inspector Daily Reports (IDRs).

DOCUMENT TYPE: Inspector Daily Report (IDR)
CONTEXT: IDRs are daily field observations written by inspectors. They capture what's happening on site day-to-day. Inspectors flag potential contractor delays with code "CODE_CIE" (Contractor Initiated Events).

YOUR TASK: Analyze this IDR and extract TWO things:
1. **Contractor's Work Activity** - The schedule activities listed in the "Contractor's Work Activity" table (if present)
2. **Delay Events** - Contractor-caused delay events from the document

=============================================================================
PART 1: EXTRACT CONTRACTOR'S WORK ACTIVITY TABLE
=============================================================================

Many IDRs contain a "Contractor's Work Activity" section/table that lists the schedule activities being worked on that day. This table typically has columns like:
- Schedule Activity # (e.g., "2-W-0471", "3-W-1042")
- Description (e.g., "Stage 1 WM: Excavate Services")
- Comments (e.g., "WM STA 7+00 to 21+50")

**IMPORTANT**: If you find this table, extract ALL entries. This information is critical for matching delay events to schedule activities efficiently.

=============================================================================
PART 2: EXTRACT DELAY EVENTS
=============================================================================

**CRITICAL: ANALYZE BOTH DSC ENTRIES AND DIARY NARRATIVE SECTIONS**

IDRs contain multiple sections with delay information. You MUST analyze ALL of them:

1. **DSC/Discrepancy entries** - Formal discrepancy codes (e.g., "DSC 293", "DSC 295")
2. **Diary sections** - Daily narrative logs with timestamps (e.g., "Diary - Jansen Civil Crew #1")

=============================================================================
DIARY SECTION ANALYSIS - VERY IMPORTANT
=============================================================================

Diary sections contain timestamped narratives of daily activities. These are RICH sources of delay information.

**TIME FORMAT RECOGNITION**: Inspectors use various formats. Recognize ALL of these:
- Military time: 0700, 0830, 1415, 2100
- AM/PM: 7am, 7:00 AM, 7:00am, 8:30 AM
- Standard: 7:00, 8:30, 14:15

**DURATION CALCULATION FROM TIMESTAMPS**:
When the Diary shows work stopped and resumed, calculate the delay duration:

Example 1:
  "0700 - crew did not start work because machine was not working"
  "0830 - crew started working after machine was fixed"
  → Delay = 1.5 hours (0700 to 0830)

Example 2:
  "1415 - large roots were encountered and Jansen stopped excavation"
  "1500 - Jansen directed to utilize Vactor Truck tomorrow"
  → Delay = at minimum 0.75 hours, but if work didn't resume that day, note "remainder of shift"

**SOURCE REFERENCE FOR DIARY ENTRIES**:
Include the Diary section name and timestamp in sourceReference:
- "Diary, 1415: Large roots encountered, excavation stopped (DSC 295)"
- "Diary, 0700-0830: Equipment breakdown delayed crew start"

=============================================================================
EXTRACTION PRIORITIES (in order):
=============================================================================
1. CODE_CIE tagged entries - These are explicitly flagged contractor delays (HIGHEST PRIORITY)
2. Diary narrative delays - Timestamped entries showing work stoppages, equipment issues, crew problems
3. Delays caused by contractor actions or inaction
4. Work stoppages due to contractor issues (equipment breakdown, crew problems)
5. Material or equipment delays from contractor
6. Subcontractor coordination failures
7. Quality issues observed that may require rework

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
      "impactDurationHours": 2.0,
      "sourceReference": "MUST include DSC/NCR number if mentioned (e.g., 'DSC 293: Page 2'). Format: 'DSC XXX' + location",
      "extractedFromCode": "CODE_CIE or IDR_OBSERVATION",
      "confidenceScore": 0.85,
      "responsibilityConfirmed": true
    }
  ]
}

NOTES:
- workActivities: Extract from "Contractor's Work Activity" table. Return empty array [] if no such table exists.
- delayEvents: Extract delay events as described above. Return empty array [] if no delays are found.

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
      extractWorkActivities: true,
    };
  }
}
