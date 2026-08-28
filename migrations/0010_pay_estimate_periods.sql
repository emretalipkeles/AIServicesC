-- One row per pay-estimate period (1-57), including periods whose item detail could not be
-- recovered at all. Idempotent: safe to re-run.
CREATE TABLE IF NOT EXISTS pay_estimate_periods (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  pe_number INTEGER NOT NULL,
  source_file TEXT NOT NULL,
  cutoff_date TEXT,
  period_start TEXT,
  period_end TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  printed_to_date_total NUMERIC,
  summed_to_date_total NUMERIC,
  to_date_delta NUMERIC,
  to_date_delta_pct NUMERIC,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pay_estimate_periods_project_idx ON pay_estimate_periods(project_id);
CREATE INDEX IF NOT EXISTS pay_estimate_periods_pe_number_idx ON pay_estimate_periods(pe_number);
