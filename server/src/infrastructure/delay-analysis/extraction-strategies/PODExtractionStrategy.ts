import type {
  IPodExtractionStrategy,
  PodExtractionContext,
  PodExtractionStrategyResult,
} from '../../../domain/delay-analysis/interfaces/IPodExtractionStrategy';

/**
 * Builds the prompt for POD structural chunking.
 *
 * This mirrors how IDRExtractionStrategy/NCRExtractionStrategy are written (a single
 * class producing a prompt string from document content), but implements POD's own
 * narrow interface rather than IDocumentExtractionStrategy: POD extraction has no
 * delay-confidence concept to report.
 *
 * The model's job here is structural chunking, not semantic interpretation: decide which
 * lines are a section heading, which are crew names, which are equipment, and which are
 * task/cost-code pairs. It is explicitly told not to interpret what any line means.
 */
export class PODExtractionStrategy implements IPodExtractionStrategy {
  buildExtractionPrompt(context: PodExtractionContext): PodExtractionStrategyResult {
    const truncatedContent = context.documentContent.slice(0, 30000);

    const prompt = `You are structuring a "Play of the Day" (POD) construction assignment sheet into JSON.

DOCUMENT TYPE: Play of the Day (POD) — a daily construction assignment sheet made of repeating
blocks such as "CIVIL #1", "CONCRETE #2", "SUBCONTRACTORS", "UPO", "Prime", and "QUALITY CONTROL".
Block types and their contents vary between reports and new block types can appear without warning.

YOUR TASK IS STRUCTURAL CHUNKING, NOT INTERPRETATION.
Decide which lines are a section heading, which are crew member names, which are equipment,
and which are task/cost-code pairs. Do NOT interpret what any line means, do not resolve
worker identities, and do not parse or validate cost codes — copy them exactly as written,
including placeholders like "TBD" or "N/A" and composite codes like "15.01 / 13.01".

RULES:
- Preserve the document's original section order.
- A "section" is one repeating block (e.g. "CIVIL #1", "SUBCONTRACTORS", "UPO", "Prime",
  "QUALITY CONTROL"). Every section needs a raw "label" (the heading text as written).
- "crewNumber" is an optional crew/team number printed near the heading (e.g. "211"). Leave
  it empty if none is printed.
- "category" is a best-effort bucket such as "civil", "concrete", "subcontractor",
  "traffic_control", "quality_control", "prime", or "other". If you are not confident, leave
  it empty rather than guessing — an empty category is always acceptable.
- "crewMembers" is a list of raw crew member name strings for that section. Empty array if none.
- "equipment" is a list of equipment entries. If the equipment name in the source text is
  wrapped in asterisks (e.g. "*JD85 EXC 30-9978*"), set "isRental": true and strip the
  asterisks from "name". Otherwise "isRental": false. Empty array if no equipment.
- "taskLines" is a list of work/location description lines paired with their raw cost code
  when one appears next to them. Use "description" for the full raw line text and "costCode"
  for the code exactly as written (or omit it if none is shown). Empty array if none.
- "trucking", "traffic", and "notes" are single text values for the section (not lists) —
  use them only when the section has a labeled Trucking/Traffic/Notes field; omit otherwise.
- Sections with no crew, no equipment, or no task lines are valid — return them with empty
  arrays for whichever sub-parts are absent, never omit the section itself.
- The document content below marks a wide gap between two side-by-side cells on the same
  line (e.g. a row label, a value, and a column header sitting next to each other) with
  extra spacing (multiple spaces), while ordinary words stay separated by a single space.
  Treat a wide gap as a boundary between distinct fields on that line, not as one run of text
  — for example "CREW    F. ROGALSKI    EQUIPMENT" is a row label, a crew member's name, and
  a column header, not a four-word phrase.

Return ONLY a JSON object (no prose, no markdown fence) with this exact shape:

{
  "reportDate": "2023-01-27",
  "title": "Play of the Day",
  "sections": [
    {
      "crewNumber": "211",
      "label": "CIVIL #1",
      "category": "civil",
      "crewMembers": ["J. BRICKMAN", "R. CABUENA"],
      "equipment": [
        { "name": "JD85 EXC 30-9978", "isRental": true }
      ],
      "taskLines": [
        { "description": "12\\" TIE-IN", "costCode": "164.01" }
      ],
      "trucking": "SEE TRUCKING DISPATCH",
      "traffic": "",
      "notes": ""
    }
  ]
}

If the document shows no year for the date, use your best judgment for "reportDate" or omit it
entirely — a missing date is acceptable and will be handled separately.

Document content (already reordered into visual reading order):
${truncatedContent}`;

    return { prompt };
  }
}
