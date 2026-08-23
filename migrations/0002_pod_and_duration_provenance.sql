-- Add POD and duration provenance columns to contractor_delay_events.
--
-- impacted_window_start/impacted_window_end capture the diary-timestamped start/end clock times
-- (HH:MM) behind a delay's impact_duration_hours figure, and duration_basis records whether that
-- figure was timestamp_derived, document_stated, or estimated. All three are nullable text so
-- pre-existing events without this provenance continue to serialize cleanly as "not recorded".
--
-- (POD source-document attribution and usage notes reuse the existing `metadata` jsonb column via
-- merge-only patches, so no new column is needed for those.)
--
-- Idempotent: safe to re-run against a database where the columns already exist.
ALTER TABLE contractor_delay_events
  ADD COLUMN IF NOT EXISTS impacted_window_start text,
  ADD COLUMN IF NOT EXISTS impacted_window_end text,
  ADD COLUMN IF NOT EXISTS duration_basis text;
