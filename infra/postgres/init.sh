#!/bin/bash
# Две роли: ortaq владеет схемой и применяет миграции, ortaq_app — рабочая роль приложения.
# У ortaq_app нет BYPASSRLS, поэтому политики RLS действуют на каждый её запрос.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE ROLE ortaq_app LOGIN PASSWORD 'ortaq_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  CREATE DATABASE ortaq_test OWNER ortaq;
SQL

for db in ortaq ortaq_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-SQL
    GRANT USAGE ON SCHEMA public TO ortaq_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE ortaq IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ortaq_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE ortaq IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ortaq_app;
SQL
done
