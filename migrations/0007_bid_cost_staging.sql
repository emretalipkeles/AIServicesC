-- Stage two bid-estimate spreadsheets for Measured Mile feasibility work:
--
-- bid_item_labor_estimates: one row per bid item from the contractor's
-- "Bid Item Summary - for MHs and Est Production Rates" workbook (item_no,
-- quantity, estimated man-hours). item_no matches the external Azure
-- progress_estimate_item.item_no key (verified against live data), NOT the
-- bid_code column there, which is inconsistent across pay-estimate revisions.
--
-- bid_item_cost_estimate_lines: flattened rows from the original HeavyBid
-- "Direct Cost Report" (HCSS) estimate export. sub_activity_code (e.g.
-- "14.01") is the same decimal cost-code scheme already seen in
-- pod_task_lines.cost_code (verified: "14.01", "6.02", "659.02" all appear in
-- both sources for matching descriptions) -- this is the crosswalk key
-- connecting POD crew/location/date data to bid items. The report's raw
-- layout mixes merged cells inconsistently row-to-row, so per-resource cost
-- bucket (labor vs material vs equipment vs sub) is NOT reliably separable;
-- only unit_cost and a single line_total are parsed with confidence.
-- raw_text preserves the full row for any future re-parse.
--
-- Idempotent: safe to re-run against a database where the tables already exist.

CREATE TABLE IF NOT EXISTS bid_item_labor_estimates (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  item_no integer NOT NULL,
  description text,
  quantity numeric,
  estimated_man_hours numeric,
  source_file text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_item_labor_estimates_project_idx ON bid_item_labor_estimates (project_id);
CREATE INDEX IF NOT EXISTS bid_item_labor_estimates_item_no_idx ON bid_item_labor_estimates (item_no);

CREATE TABLE IF NOT EXISTS bid_item_cost_estimate_lines (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id varchar NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id varchar NOT NULL DEFAULT 'default',
  bid_item_no integer,
  bid_item_description text,
  sub_activity_code text,
  sub_activity_description text,
  sub_activity_quantity numeric,
  sub_activity_unit text,
  resource_code text,
  resource_description text,
  pieces numeric,
  quantity numeric,
  unit text,
  unit_cost numeric,
  line_total numeric,
  line_kind varchar NOT NULL,
  row_index integer NOT NULL,
  raw_text text NOT NULL,
  source_file text NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_item_cost_estimate_lines_project_idx ON bid_item_cost_estimate_lines (project_id);
CREATE INDEX IF NOT EXISTS bid_item_cost_estimate_lines_bid_item_idx ON bid_item_cost_estimate_lines (bid_item_no);
CREATE INDEX IF NOT EXISTS bid_item_cost_estimate_lines_sub_activity_idx ON bid_item_cost_estimate_lines (sub_activity_code);
