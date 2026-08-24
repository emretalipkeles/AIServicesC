-- Foreman Diary daily reports: adds a structured-extraction summary column to
-- project_documents, plus diary_reports / diary_entries tables mirroring the POD tree.
--
-- Idempotent: safe to re-run against a database where these already exist.

ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS structured_extraction_summary text;

CREATE TABLE IF NOT EXISTS diary_reports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id varchar NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  report_date timestamp NOT NULL,
  sequence integer NOT NULL,
  extraction_method text NOT NULL DEFAULT 'deterministic',
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diary_reports_source_document_idx ON diary_reports (source_document_id);
CREATE INDEX IF NOT EXISTS diary_reports_report_date_idx ON diary_reports (report_date);

CREATE TABLE IF NOT EXISTS diary_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id varchar NOT NULL REFERENCES diary_reports(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  author_name text NOT NULL,
  weather text,
  note_text text NOT NULL DEFAULT '',
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diary_entries_report_idx ON diary_entries (report_id);
