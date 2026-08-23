#!/bin/bash
set -e

npm install --ignore-scripts

# Hand-written SQL migrations run before db:push. drizzle-kit push infers column changes and will
# not perform type conversions it considers destructive, so changes such as integer -> real must be
# applied explicitly. Every file here is written to be idempotent and safe to re-run.
if [ -d migrations ] && [ -n "$AWS_DATABASE_URL" ]; then
  for sql_file in migrations/*.sql; do
    [ -e "$sql_file" ] || continue
    echo "Applying migration: $sql_file"
    psql "$AWS_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$sql_file"
  done
fi

npm run db:push --force
