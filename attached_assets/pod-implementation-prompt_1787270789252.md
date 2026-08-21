# Implementation prompt: Play of the Day (POD) schema + extraction pipeline

## Context

The app already ingests documents (IDR, NCR, Field Memo, Contract Plan, DSC Claim, Other) via a document type selector, stores raw content in `project_documents`, and — for IDR/NCR — runs an AI-driven extraction pipeline: deterministic text extraction (`PdfDocumentParser.ts` / `WordDocumentParser.ts`) feeds a document-type-specific strategy (`IDRExtractionStrategy.ts`, `NCRExtractionStrategy.ts`) that prompts an LLM to produce structured JSON, which is then deterministically validated and coerced before persistence.

We're adding a new document type: **Play of the Day (POD)** — a daily construction report made of repeating, loosely-structured blocks (e.g. "CIVIL #1", "CONCRETE #2", "SUBCONTRACTORS", "UPO", "Prime", "QUALITY CONTROL"). These blocks vary in which sub-parts they contain (crew names, equipment, task/cost-code pairs, trucking/traffic/notes) and new block types can appear without warning. A rigid per-field schema will break; the schema below normalizes the repeating *container structure* and keeps genuinely variable leaf content as text.

This is additive: `project_documents` keeps working exactly as it does today for every document type, including POD. The new tables below are populated **in addition to**, not instead of, that existing raw-content row.

---

## Part 1 — Schema changes

All new tables are prefixed `pod_` since they are specific to this document type. Match the primary key type/ID generation strategy already used by `project_documents` (serial/bigserial or uuid — whichever the existing schema uses) rather than introducing a second convention.

```sql
-- Header: one row per POD document
CREATE TABLE pod_reports (
    id                  <PK_TYPE> PRIMARY KEY <PK_DEFAULT>,
    source_document_id  <FK_TYPE> NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
    report_date         DATE NOT NULL,
    report_title        TEXT,           -- e.g. "Play of the Day", "MBRT Play of the Day"
    created_at          TIMESTAMP NOT NULL DEFAULT now()
);

-- Repeating blocks within a report (CIVIL #1, CONCRETE #2, SUBCONTRACTORS, UPO, Prime, QUALITY CONTROL, ...)
CREATE TABLE pod_sections (
    id               <PK_TYPE> PRIMARY KEY <PK_DEFAULT>,
    report_id        <FK_TYPE> NOT NULL REFERENCES pod_reports(id) ON DELETE CASCADE,
    sequence_number  INT NOT NULL,        -- preserves original document order
    crew_number      TEXT,                -- e.g. "211"; nullable, some blocks omit it
    section_label    TEXT NOT NULL,       -- raw heading text, e.g. "CIVIL #1", "UPO"
    section_category TEXT,                -- normalized bucket derived from label text:
                                           -- civil | concrete | subcontractor | traffic_control
                                           -- | quality_control | prime | other
                                           -- NO check constraint — new categories must not
                                           -- break ingestion, this is advisory metadata only
    trucking_note    TEXT,                -- e.g. "SEE TRUCKING DISPATCH"
    traffic_note     TEXT,                -- e.g. "2 UPO", "1 UPO & 1 FLAGGER"
    other_notes      TEXT,                -- the "Notes" field when present
    created_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE pod_crew_members (
    id               <PK_TYPE> PRIMARY KEY <PK_DEFAULT>,
    section_id       <FK_TYPE> NOT NULL REFERENCES pod_sections(id) ON DELETE CASCADE,
    sequence_number  INT NOT NULL,
    member_name      TEXT NOT NULL,       -- raw, e.g. "J. BRICKMAN"
    worker_id        <FK_TYPE>            -- reserved for a future workers dimension table;
                                           -- leave NULL for now, do not populate in this phase
);

CREATE TABLE pod_equipment (
    id               <PK_TYPE> PRIMARY KEY <PK_DEFAULT>,
    section_id       <FK_TYPE> NOT NULL REFERENCES pod_sections(id) ON DELETE CASCADE,
    sequence_number  INT NOT NULL,
    equipment_name   TEXT NOT NULL,       -- asterisks stripped, e.g. "JD85 EXC 30-9978"
    is_rental        BOOLEAN NOT NULL DEFAULT false  -- true if source text was wrapped in *asterisks*
);

CREATE TABLE pod_task_lines (
    id               <PK_TYPE> PRIMARY KEY <PK_DEFAULT>,
    section_id       <FK_TYPE> NOT NULL REFERENCES pod_sections(id) ON DELETE CASCADE,
    sequence_number  INT NOT NULL,
    task_text        TEXT NOT NULL,       -- raw work/location description line
    cost_code        TEXT                 -- raw, preserve as-is: "164.01", "TBD", "N/A",
                                           -- composite codes like "15.01 / 13.01"
);

CREATE INDEX idx_pod_sections_report ON pod_sections(report_id);
CREATE INDEX idx_pod_crew_section ON pod_crew_members(section_id);
CREATE INDEX idx_pod_equipment_section ON pod_equipment(section_id);
CREATE INDEX idx_pod_tasks_section ON pod_task_lines(section_id);
CREATE INDEX idx_pod_reports_date ON pod_reports(report_date);
```

Notes on modeling decisions (context so Replit doesn't "fix" these):

- **`trucking_note` / `traffic_note` / `other_notes` are columns on `pod_sections`, not child tables.** Across both sample documents these are always single values per section, not repeating lists — unlike crew members, equipment, and task lines, which do repeat.
- **`section_category` has no enum/check constraint on purpose.** New block types (we've already seen "Prime", "SUBCONTRACTORS", "UPO", "QUALITY CONTROL" beyond the obvious CIVIL/CONCRETE ones) must insert cleanly without a migration. Populate it as a best-effort classification from the label text; leave it null rather than guessing when the model isn't confident.
- **`pod_task_lines.cost_code` stays as raw text, never parsed into numeric components.** Composite codes and placeholders ("TBD", "N/A") are common and any coercion attempt will throw them away or misparse them.
- **The "Prime" block's "CREW 1:", "CREW 2:", "CREW 3:" sub-labels are not a new table.** Store them as `pod_task_lines` rows where `task_text` is the label + description (e.g. `"CREW 1: 16TH/MAD U.G."`), consistent with how every other block's location/task lines are stored.
- **No hours or status columns anywhere.** Unlike the earlier synthetic mockup, real POD documents don't carry per-person hours or task status — don't add nullable columns for data that structurally doesn't exist in this document type.

---

## Part 2 — Extraction pipeline

Reuse the existing pipeline shape; only the target schema and the strategy file are new.

1. **Document type selector**: add `"Play of the Day (POD)"` as a new option alongside the existing IDR / NCR / Field Memo / Contract Plan / DSC Claim / Other list.
2. **Raw text extraction**: unchanged — `PdfDocumentParser.ts` / `WordDocumentParser.ts` continue to just pull plain text, same as every other document type.
3. **`project_documents` insert**: unchanged — every uploaded file, including POD, still gets a row here with `document_type = 'pod'` and the raw text, exactly as today.
4. **New `PODExtractionStrategy.ts`**, following the same pattern as `IDRExtractionStrategy.ts` / `NCRExtractionStrategy.ts`. The prompt should ask the model to do **structural chunking**, not deep semantic classification — the model's job is "which lines are a section header, which are crew names, which are equipment, which are task/cost-code pairs" rather than "what does this specific line mean." Target JSON shape:

```json
{
  "report_date": "2023-01-27",
  "report_title": "Play of the Day",
  "sections": [
    {
      "sequence_number": 1,
      "crew_number": "211",
      "section_label": "CIVIL #1",
      "section_category": "civil",
      "crew_members": ["J. BRICKMAN", "R. CABUENA"],
      "equipment": [
        { "name": "JD85 EXC 30-9978", "is_rental": true },
        { "name": "JD50 EXC BIRCH 30-9960", "is_rental": true }
      ],
      "task_lines": [
        { "text": "SERVICE TRANSFER", "cost_code": "TBD" },
        { "text": "12\" TIE-IN", "cost_code": "164.01" }
      ],
      "trucking_note": "SEE TRUCKING DISPATCH",
      "traffic_note": null,
      "other_notes": null
    }
  ]
}
```

5. **Deterministic post-processing** (same pattern as IDR/NCR: code-fence stripping, `JSON.parse`, validation, low-confidence filtering) walks this JSON into `pod_reports` → `pod_sections` → `pod_crew_members` / `pod_equipment` / `pod_task_lines`.
6. **Transaction + idempotency**: wrap the full insert (report + all sections + all children) in a single DB transaction per document. If a POD file is reprocessed (re-upload of the same `source_document_id`), delete the existing `pod_reports` row for that `source_document_id` first (cascades to sections/children via `ON DELETE CASCADE`) and reinsert, rather than appending duplicates.
7. **Trigger point**: the POD extraction pipeline runs immediately after the `project_documents` row is committed, referencing its `id` as `pod_reports.source_document_id`. If extraction fails, the `project_documents` row must still persist — a failed structured extraction should never block the raw-content save that already works for every other document type today.

---

## Part 3 — Explicitly deferred (do not build in this pass)

- **Worker dimension/name resolution** (`pod_crew_members.worker_id`, `pod_workers` table) — names appear with inconsistent formatting across reports (e.g. spelling variants) and need a separate normalization pass. Leave `worker_id` null for now.
- **Semantic parsing of UPO block lines** (e.g. splitting `"1 UPO @ 19TH/MAD W/STEVE"` into location + assigned person) — store as a `pod_task_lines` row with the full raw text; this is exactly the kind of line-level interpretation better left to query-time analysis than ingestion-time extraction.
- **Cost code numeric typing or code-book validation** — keep as raw text indefinitely unless a specific reporting need requires it.

---

## Part 4 — Acceptance criteria

- Uploading either attached sample PDF (the messy MBRT one and the well-structured Jansen one) produces a `project_documents` row (unchanged behavior) plus a fully populated `pod_reports` → `pod_sections` → children tree, with no schema changes required between the two despite their structural differences.
- Re-uploading the same file replaces rather than duplicates its `pod_*` rows.
- A section with no crew, no equipment, or no task lines (e.g. the empty "SUBCONTRACTORS" block, or "CIVIL #5" with equipment but no crew) inserts cleanly with empty child collections — no NOT NULL violations on absent sub-parts.
- A previously unseen `section_label` (something other than CIVIL/CONCRETE/SUBCONTRACTORS/UPO/Prime/QUALITY CONTROL) inserts successfully with `section_category` either correctly inferred or left null — it must never cause an insert failure.
