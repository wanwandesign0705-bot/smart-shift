# supabase/

| ファイル | 中身 |
|---|---|
| `schema.sql` | データベースの定義（テーブル20個、権限の判定、行単位のアクセス制御）。Supabase の SQL エディタに丸ごと貼って1回実行する |

流し方は `docs/supabase-setup.md` にあります。
中身を変えたら、`tests/run-schema-test.sh` でテストしてから使ってください（`tests/README.md`）。
