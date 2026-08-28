-- Job labor hours staged from the "Employee Job Detail Report by Earn Code & Pay Date" PDF
-- (Azure claims-investigation database, payroll_document + page_text).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS payroll_job_labor_entries (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  employee_number TEXT NOT NULL,
  employee_raw TEXT NOT NULL,
  earn_code TEXT NOT NULL,
  trade_raw TEXT NOT NULL,
  trade_code TEXT,
  trade_label TEXT,
  trade_category TEXT,
  trade_resolved BOOLEAN NOT NULL DEFAULT false,
  marker TEXT,
  amount NUMERIC NOT NULL,
  hours NUMERIC,
  pay_date_raw TEXT NOT NULL,
  pay_date TEXT,
  estimated_work_date_start TEXT,
  estimated_work_date_end TEXT,
  assumed_offset_min_days INTEGER NOT NULL DEFAULT 1,
  assumed_offset_max_days INTEGER NOT NULL DEFAULT 14,
  page_no INTEGER NOT NULL,
  quarantined BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  source_file TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_job_labor_entries_project_idx ON payroll_job_labor_entries(project_id);
CREATE INDEX IF NOT EXISTS payroll_job_labor_entries_pay_date_idx ON payroll_job_labor_entries(pay_date);
CREATE INDEX IF NOT EXISTS payroll_job_labor_entries_employee_idx ON payroll_job_labor_entries(employee_number);
CREATE INDEX IF NOT EXISTS payroll_job_labor_entries_trade_category_idx ON payroll_job_labor_entries(trade_category);

CREATE TABLE IF NOT EXISTS payroll_reconciliation (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  employee_number TEXT NOT NULL,
  printed_amount_subtotal NUMERIC,
  printed_hours_subtotal NUMERIC,
  computed_amount_subtotal NUMERIC NOT NULL,
  computed_hours_subtotal NUMERIC NOT NULL,
  amount_delta NUMERIC,
  hours_delta NUMERIC,
  hours_delta_pct NUMERIC,
  status TEXT NOT NULL,
  notes TEXT,
  page_no INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payroll_reconciliation_project_idx ON payroll_reconciliation(project_id);
CREATE INDEX IF NOT EXISTS payroll_reconciliation_employee_idx ON payroll_reconciliation(employee_number);
CREATE INDEX IF NOT EXISTS payroll_reconciliation_status_idx ON payroll_reconciliation(status);
