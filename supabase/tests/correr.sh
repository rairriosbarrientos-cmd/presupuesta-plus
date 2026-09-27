#!/usr/bin/env bash
# Prueba la migración en un Postgres local desechable (no en Supabase).
# Uso: PGHOST=/tmp PGPORT=5433 PGUSER=postgres bash supabase/tests/correr.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=cuentas_pruebas
dropdb --if-exists "$DB"
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/auth_stub.sql
# Dos veces para comprobar que la migración es repetible.
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/001_cuentas.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/001_cuentas.sql
salida=$(psql -q -o /dev/null -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/cuentas.test.sql 2>&1) || { echo "$salida"; exit 1; }
echo "$salida" | sed -n 's/.*NOTICE:  //p'
echo "Pruebas pasadas: $(echo "$salida" | grep -c 'NOTICE:  OK')"
dropdb "$DB"
