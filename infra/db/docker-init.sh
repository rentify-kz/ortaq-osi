#!/usr/bin/env bash
set -euo pipefail
for db in ortaq ortaq_test; do
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v db=$db -v migrator_pw=migrator -v app_rw_pw=app_rw -v app_admin_pw=app_admin \
    -f /docker-entrypoint-initdb.d/bootstrap.sql.in
done
