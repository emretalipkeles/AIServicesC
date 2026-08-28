-- Additive, independently-verifiable integrity fields for XER round-trip runs.
-- No existing column semantics or pass/fail logic changes; this only adds
-- storage for SHA-256 hashes and a structural (table/row/byte-count)
-- fingerprint so a run's result can be checked outside the app itself.
ALTER TABLE xer_runs ADD COLUMN IF NOT EXISTS original_sha256 text;
ALTER TABLE xer_runs ADD COLUMN IF NOT EXISTS output_sha256 text;
ALTER TABLE xer_runs ADD COLUMN IF NOT EXISTS structural_summary jsonb;
