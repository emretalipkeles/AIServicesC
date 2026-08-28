-- Measured labor hours staged from the separate Azure claims-investigation database.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS force_account_transactions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  txn_id TEXT NOT NULL,
  txn_type TEXT NOT NULL,
  txn_date_raw TEXT NOT NULL,
  txn_date TEXT,
  resource TEXT,
  classification TEXT,
  craft TEXT,
  time_basis TEXT,
  quantity NUMERIC,
  unit TEXT,
  rate NUMERIC,
  amount NUMERIC,
  cost_code TEXT,
  fa_no TEXT,
  work_description TEXT,
  vendor_or_sub TEXT,
  source_doc_id TEXT,
  locator TEXT,
  verbatim_line TEXT,
  quarantined BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  source_system TEXT NOT NULL DEFAULT 'azure_claims_db:cost_transaction',
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS force_account_transactions_project_idx ON force_account_transactions(project_id);
CREATE INDEX IF NOT EXISTS force_account_transactions_txn_date_idx ON force_account_transactions(txn_date);
CREATE INDEX IF NOT EXISTS force_account_transactions_txn_type_idx ON force_account_transactions(txn_type);
CREATE INDEX IF NOT EXISTS force_account_transactions_project_txn_idx ON force_account_transactions(project_id, txn_id);

CREATE TABLE IF NOT EXISTS inspector_daily_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES delay_analysis_projects(id) ON DELETE CASCADE,
  tenant_id VARCHAR NOT NULL DEFAULT 'default',
  azure_dr_id TEXT NOT NULL,
  report_date TEXT,
  date_agreement TEXT,
  contractor TEXT,
  location_ TEXT,
  inspector TEXT,
  crew_count INTEGER,
  contract_work_performed TEXT,
  delays_and_reason TEXT,
  extra_work_force_account TEXT,
  equipment_table TEXT,
  source_file TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspector_daily_reports_project_idx ON inspector_daily_reports(project_id);
CREATE INDEX IF NOT EXISTS inspector_daily_reports_report_date_idx ON inspector_daily_reports(report_date);
CREATE INDEX IF NOT EXISTS inspector_daily_reports_project_dr_idx ON inspector_daily_reports(project_id, azure_dr_id);
