#!/usr/bin/env bash
# Creates (or recreates) the local verification database and applies the
# auth shim, all migrations and the seed. Requires PostgreSQL 16 binaries.
#
# Usage: scripts/db/reset-local.sh [--no-seed]
set -euo pipefail

PGDATA="${SL_PGDATA:-/tmp/sl-pgdata}"
PGPORT="${SL_PGPORT:-5433}"
DB=sisters_lounge
export PGHOST=localhost PGPORT PGUSER=postgres

PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)

# postgres refuses to run as root; drop to the postgres system user if needed.
run_pg() {
  if [ "$(id -u)" = "0" ]; then
    su postgres -s /bin/bash -c "$*"
  else
    bash -c "$*"
  fi
}

if [ ! -d "$PGDATA/base" ]; then
  mkdir -p "$PGDATA"
  [ "$(id -u)" = "0" ] && chown postgres "$PGDATA"
  run_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres --auth=trust -E UTF8" >/dev/null
  echo "unix_socket_directories = '/tmp'" >> "$PGDATA/postgresql.conf"
fi

if ! run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' status" >/dev/null 2>&1; then
  run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -o '-p $PGPORT -k /tmp' -l '$PGDATA/log' start" >/dev/null
fi

psql -h /tmp -c "drop database if exists $DB" postgres >/dev/null
psql -h /tmp -c "create database $DB" postgres >/dev/null

psql -h /tmp -v ON_ERROR_STOP=1 -q -d $DB -f scripts/db/auth-shim.sql

for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql -h /tmp -v ON_ERROR_STOP=1 -q -d $DB -f "$f"
done

if [ "${1:-}" != "--no-seed" ]; then
  echo "applying supabase/seed.sql"
  psql -h /tmp -v ON_ERROR_STOP=1 -q -d $DB -f supabase/seed.sql
fi

echo "local database '$DB' ready on port $PGPORT"
