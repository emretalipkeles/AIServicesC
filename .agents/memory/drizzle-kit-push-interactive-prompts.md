---
name: drizzle-kit push interactive prompts
description: drizzle-kit push can hang on rename-detection or data-loss confirmation prompts unrelated to your schema change; how to get new tables applied without answering them wrong.
---

Running `npm run db:push` (drizzle-kit push) against a database with substantial existing schema drift can present interactive TTY prompts that are hard to script around in a non-interactive shell:
- "Is `<new_table>` created or renamed from another table?" — drizzle-kit's heuristic can falsely suggest renaming from an unrelated existing table (e.g. a `session` table) when a brand-new table's column shapes happen to look similar.
- Unrelated pre-existing drift can also surface a data-loss confirmation (e.g. "add a unique constraint, truncate the table?") for tables you never touched.

**Why:** piping newlines via `printf`/`echo` to auto-advance these menus is unreliable (they're arrow-key selects, not plain confirmations) and risks accidentally selecting a destructive option (truncate, rename) on tables unrelated to your change.

**How to apply:** for a small, well-understood set of brand-new tables, skip `db:push`'s interactive flow entirely and apply the exact `CREATE TABLE`/`CREATE INDEX` DDL directly via `psql "$AWS_DATABASE_URL"` (or the project's DB URL secret), matching the Drizzle schema definitions column-for-column (varchar + `gen_random_uuid()` PK convention, FKs, indexes). Verify afterward with `psql ... -c '\d <table>'`. Never answer a truncate/rename prompt for tables you didn't intend to change — if db:push surfaces one, back out and use direct SQL instead.
