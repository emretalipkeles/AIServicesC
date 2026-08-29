-- Measured Mile page: user-controlled overlays on top of the deterministically computed series.
-- Both tables are pure UI state (no analytical figure is derived FROM these rows themselves --
-- they only steer which periods the calculator treats as "acceleration" or as the measured-mile
-- window), so they are intentionally tiny and hold no computed values.

CREATE TABLE IF NOT EXISTS measured_mile_period_tags (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  item_no INTEGER NOT NULL,
  pe_number INTEGER NOT NULL,
  tag TEXT NOT NULL DEFAULT 'acceleration',
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS measured_mile_period_tags_unique_idx
  ON measured_mile_period_tags (project_id, item_no, pe_number, tag);

CREATE INDEX IF NOT EXISTS measured_mile_period_tags_project_item_idx
  ON measured_mile_period_tags (project_id, item_no);

CREATE TABLE IF NOT EXISTS measured_mile_window_overrides (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  item_no INTEGER NOT NULL,
  start_pe_number INTEGER NOT NULL,
  end_pe_number INTEGER NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS measured_mile_window_overrides_unique_idx
  ON measured_mile_window_overrides (project_id, item_no);
