-- Progress Estimate (pay estimate) line items: one row per (pay-estimate period, bid item),
-- parsed from the 57 SDOT "Progress Estimate Detail" documents (Template C-20D). Unlike
-- bid_item_cost_estimate_lines/bid_item_labor_estimates (single point-in-time bid estimates),
-- this table carries a real, approved, dated time series of actual installed quantity and
-- actual $ paid per bid item -- the "actual production over time" axis for Measured Mile.
--
-- itemNo uses the same crosswalk key as bid_item_labor_estimates.item_no /
-- bid_item_cost_estimate_lines.bid_item_no (verified to match across sample item numbers).
--
-- previousAmount/quantityThisEstimate/amountDueThisEstimate are nullable: the PDF-format
-- estimates carry them directly, but the one xlsx-format estimate (PE47) only exposes
-- quantityToDate/totalAmountToDate -- period deltas for that row can be derived later from
-- the surrounding PEs' cumulative values.
--
-- Idempotent: safe to re-run against a database where the table already exists.

CREATE TABLE IF NOT EXISTS bid_item_progress_estimates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  pe_number integer NOT NULL,
  cutoff_date date,
  period_start date,
  period_end date,
  item_no integer,
  bid_code text,
  description text,
  units text,
  unit_price numeric,
  contract_quantity numeric,
  quantity_to_date numeric,
  percent_complete numeric,
  total_amount_to_date numeric,
  previous_amount numeric,
  quantity_this_estimate numeric,
  amount_due_this_estimate numeric,
  source_file text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_item_progress_estimates_project_idx ON bid_item_progress_estimates(project_id);
CREATE INDEX IF NOT EXISTS bid_item_progress_estimates_item_no_idx ON bid_item_progress_estimates(item_no);
CREATE INDEX IF NOT EXISTS bid_item_progress_estimates_pe_number_idx ON bid_item_progress_estimates(pe_number);
