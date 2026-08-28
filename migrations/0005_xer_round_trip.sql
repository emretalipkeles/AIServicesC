-- Durable storage for immutable XER baselines and deterministic null-test runs.
-- No schedule data is imported or modified by this migration.
CREATE TABLE IF NOT EXISTS xer_uploads (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  filename text NOT NULL,
  content_type text NOT NULL,
  detected_version text,
  file_data bytea NOT NULL,
  parse_error text,
  created_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS xer_runs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id varchar NOT NULL REFERENCES xer_uploads(id) ON DELETE CASCADE,
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  outcome text NOT NULL,
  detected_version text,
  diff_report jsonb,
  output_data bytea,
  error_message text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS xer_uploads_project_tenant_idx ON xer_uploads(project_id, tenant_id);
CREATE INDEX IF NOT EXISTS xer_runs_upload_tenant_idx ON xer_runs(upload_id, tenant_id);