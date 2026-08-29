-- Measured Mile street/distance view: corridor location ordering and free-text correction
-- overlays. Like migration 0013, these are pure UI/config state -- no analytical figure is
-- derived FROM these rows, they only steer how CorridorLocationAllocationCalculator interprets
-- location evidence gathered live from schedule_activities/pod_task_lines at query time.

CREATE TABLE IF NOT EXISTS corridor_locations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  location_key TEXT NOT NULL,
  label TEXT NOT NULL,
  station_order REAL NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS corridor_locations_unique_idx
  ON corridor_locations (project_id, location_key);

CREATE INDEX IF NOT EXISTS corridor_locations_project_idx
  ON corridor_locations (project_id);

-- Exact raw-text -> forced location key correction, consulted before the regex matcher
-- (matchLocationText) in CorridorLocationAllocationCalculator. raw_text_normalized is the
-- lowercased/trimmed lookup key; raw_text preserves the original for display in the UI.
CREATE TABLE IF NOT EXISTS corridor_location_overrides (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  raw_text TEXT NOT NULL,
  raw_text_normalized TEXT NOT NULL,
  location_key TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS corridor_location_overrides_unique_idx
  ON corridor_location_overrides (project_id, raw_text_normalized);

CREATE INDEX IF NOT EXISTS corridor_location_overrides_project_idx
  ON corridor_location_overrides (project_id);
