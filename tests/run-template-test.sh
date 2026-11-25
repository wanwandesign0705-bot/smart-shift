#!/usr/bin/env bash
# アプリの業種テンプレートが、schema.sql のデータベースに店長の権限で入るかを確かめる。
# 先に npm run test:account を一度動かして dist-test/ を作っておくこと。接続先は run-schema-test.sh と同じ。
set -euo pipefail
cd "$(dirname "$0")/.."
ROWS=$(mktemp)
node tests/dump-template-rows.cjs "$ROWS"
DB=smartshift_test
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated service_role; do psql -X -q -d postgres -c "drop role if exists $r"; done
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f tests/supabase-shim.sql
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f supabase/schema.sql
psql -X -q -d $DB -v ON_ERROR_STOP=1 -v rows="$(cat "$ROWS")" -f tests/template-test.sql 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1 /; s/^NOTICE //'
status=${PIPESTATUS[0]}; rm -f "$ROWS"; exit "$status"
