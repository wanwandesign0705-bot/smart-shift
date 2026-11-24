#!/usr/bin/env bash
# schema.sql を、空のデータベースに流してテストする。
# 使い方：PGHOST などで接続先を指定して  bash tests/run-schema-test.sh
# テスト用に smartshift_test というデータベースを作り直すので、本番の Supabase には向けないこと。
set -euo pipefail
cd "$(dirname "$0")/.."
DB=smartshift_test
psql -X -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
for r in anon authenticated service_role; do
  psql -X -q -d postgres -tAc "select 1 from pg_roles where rolname='$r'" | grep -q 1 && psql -X -q -d postgres -c "drop role $r"
done
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f tests/supabase-shim.sql
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f supabase/schema.sql
# 結果（PASS／FAIL）だけを見やすく表示する
psql -X -q -d $DB -v ON_ERROR_STOP=1 -f tests/schema-test.sql 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE|ERROR):  /\1 /; s/^NOTICE //'
exit "${PIPESTATUS[0]}"
