-- Add labor/material/matl-exp/equipment/subcontract cost bucket columns to
-- bid_item_cost_estimate_lines. These were not reliably separable from the original
-- xlsx export of the HCSS Direct Cost Report (merged-cell text bled across logical
-- columns), but ARE reliably separable once parsed from the PDF export of the same
-- report, whose text carries real x/y coordinates -- see scripts/stage-bid-cost-data-pdf.ts.
--
-- Idempotent: safe to re-run against a database where the columns already exist.

ALTER TABLE bid_item_cost_estimate_lines
  ADD COLUMN IF NOT EXISTS labor_cost numeric,
  ADD COLUMN IF NOT EXISTS material_cost numeric,
  ADD COLUMN IF NOT EXISTS matl_exp_cost numeric,
  ADD COLUMN IF NOT EXISTS equipment_cost numeric,
  ADD COLUMN IF NOT EXISTS subcontract_cost numeric;
