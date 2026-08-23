-- Store fractional contractor delay durations.
--
-- impact_duration_hours was an integer column, so durations calculated from diary timestamp gaps
-- (0.75h, 1.5h, 4.5h) were silently coerced to whole hours, destroying the evidence that a duration
-- had been calculated rather than estimated. Existing whole-hour values convert without loss.
--
-- Idempotent: safe to re-run against a database where the column is already `real`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'contractor_delay_events'
      AND column_name = 'impact_duration_hours'
      AND data_type <> 'real'
  ) THEN
    ALTER TABLE contractor_delay_events
      ALTER COLUMN impact_duration_hours TYPE real
      USING impact_duration_hours::real;
  END IF;
END
$$;
