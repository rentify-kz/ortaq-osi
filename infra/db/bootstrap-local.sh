#!/usr/bin/env bash
# Создаёт роли и базы ortaq и ortaq_test на локальном Postgres (без Docker).
# Пароли — только для local; в staging/prod роли создаёт Terraform, пароли в Lockbox.
set -euo pipefail
PSQL=${PSQL:-"psql"}
AS_SUPERUSER=${AS_SUPERUSER:-"sudo -u postgres"}
if [ "$(id -u)" = "0" ]; then AS_SUPERUSER="su postgres -c"; fi
DIR="$(cd "$(dirname "$0")" && pwd)"
for db in ortaq ortaq_test; do
  cmd="$PSQL -v ON_ERROR_STOP=1 -v db=$db -v migrator_pw=migrator -v app_rw_pw=app_rw -v app_admin_pw=app_admin -f $DIR/bootstrap.sql"
  if [ "$AS_SUPERUSER" = "su postgres -c" ]; then su postgres -c "$cmd"; else $AS_SUPERUSER $cmd; fi
done
echo "Базы ortaq и ortaq_test готовы."
