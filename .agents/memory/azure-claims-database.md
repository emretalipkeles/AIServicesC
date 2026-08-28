---
name: Azure claims-investigation database
description: A second database holds labor hours, force-account costs, and owner daily reports for the same job the app analyzes — not referenced anywhere in application code.
---

`AZURE_DATABASE_CONNECTION_STRING` points at a **claims-investigation database that is entirely
separate from the app's own database** (`AWS_DATABASE_URL`). No application code reads it — it is
discoverable only by connecting directly. It covers the same job the app analyzes (contractor
"Jansen Inc.", payroll job code `211 - Madison Street BRT`).

**Why this matters:** the app's own schema has no actual labor-hour data, so any productivity
analysis built only on app tables is forced into a crew-count proxy. That conclusion is wrong if
you forget this database exists.

## Connection quirk

The connection string is libpq keyword/value format (`host=... port=... dbname=... user=...
password=... sslmode=require`), which `psql "$AZURE_DATABASE_CONNECTION_STRING"` reads natively.
The `pg` npm package's `Pool({ connectionString })` **mis-parses this format** — it expects a
`postgres://` URI and silently produces a bogus config (observed: host became the literal string
`"base"`). Parse the keyword/value pairs manually into a `{ host, port, database, user, password,
ssl }` object before passing to `pg.Pool`. Azure's managed Postgres presents a publicly-trusted
certificate chain, so plain `ssl: true` (normal certificate verification) connects successfully —
no need to weaken verification with `rejectUnauthorized: false`.

## What it holds that the app database does not

- `cost_transaction` — force-account transactions only (every row is a `FORCE_ACCOUNT_*` type).
  Labor rows carry measured man-hours per person per day with craft and rate. These are **changed
  and extra work hours, not base-contract production hours**: the right numerator for disruption
  intensity, the wrong denominator for a productivity factor.
- `payroll_document` + `page_text` — payroll source documents with **full page text already
  extracted**. The "Employee Job Detail Report by Earn Code & Pay Date" is job-coded and gives
  total hours by employee/trade/earn code/date. Total minus force account = base-contract hours.
- `daily_report` / `daily_report_field` — the **owner's inspector** daily reports, independent of
  the contractor's POD records. The `crew_roster` field holds a plain integer daily crew headcount,
  which cross-checks the POD-derived crew proxy.

## Traps

- Person names are pseudonymized (`PERSON-xxxx`), and the substitution ran **inline through trade
  labels**, mangling some of them. Trade code prefixes (`OPP2F`, `LIV`, `TRK1A`, `MAS95`) survive
  and are the reliable key.
- `cost_transaction.txn_date` is **text**, not a date; ~1% of rows are null or parse to junk years
  (2002, 2014). Quarantine (flag, don't drop) rather than coerce.
- Force-account labor rows have no location or workfront at all, and a cost code on under a third
  of rows. They attach to a date and a change order, never to a bid item or a street.
- `n_source_copies` on `cost_transaction` is provenance (how many source PDF copies reproduced the
  same sheet), **not a multiplier** — each row is already one deduplicated occurrence of the money.
- `register11_cost_line.st_hours` / `ot_hours` and the `cost_item` table look promising and are
  **completely unpopulated**. Checked; don't re-investigate.
- Payroll dates are **pay dates, not work dates** — a lag of up to a week or two against field
  production. Fine at monthly granularity, wrong if treated as work dates.

**How to apply:** when a task needs labor hours, cost detail, or an owner-side daily record, check
here before concluding the data does not exist. Stage what you need into the app database rather
than querying Azure at request time — the app should keep one data source, matching how the pay
estimates were handled.
