-- Adds PDF page attribution to diary_entries so Results-tab evidence can reference which
-- page(s) a foreman diary note came from. Idempotent: safe to re-run.

ALTER TABLE diary_entries
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS page_range_end integer;
