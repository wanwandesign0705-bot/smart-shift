#!/usr/bin/env bash
# アプリが Supabase に送る操作を、schema.sql の DB に流して確かめる（作業4）。
# 先に npm run test:cloud を一度動かして dist-test/ を作っておくこと。接続先は run-schema-test.sh と同じ。
set -euo pipefail
cd "$(dirname "$0")/.."
OPS=$(mktemp)
node tests/dump-cloud-rows.cjs "$OPS"
DB=smartshift_test
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated service_role; do psql -X -q -d postgres -c "drop role if exists $r"; done
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f tests/supabase-shim.sql
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql -X -q -d $DB -v ON_ERROR_STOP=1 -v ops="$(cat "$OPS")" -f tests/cloud-rows-test.sql 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1 /; s/^NOTICE //'
status=${PIPESTATUS[0]}; rm -f "$OPS"; exit "$status"
