# Supabase の準備と schema.sql の流し方（作業2）

実行はご自身で行ってください。所要時間は20〜30分ほどです。

> **画面の項目名について**：この手順を書いた環境からは supabase.com を開けなかったため、メニュー名は2026年時点の知識で書いています。名前が違うときは、管理画面上部の検索（⌘K / Ctrl+K）で「anonymous」「captcha」「connect」などと探してください。

## 0. 用意するもの

- `supabase/schema.sql`（設計書に添付のもの。このリポジトリにはまだ入っていません）
- Supabase のアカウント
- Cloudflare のアカウント（手順4の Turnstile 用）

## 1. プロジェクトを作る

1. Supabase の管理画面で **New project** を押す
2. 設定する値
   - Name：`smart-shift-dev`（検証用。本番用は作業10で別に作るか、Pro に上げる）
   - Region：**Northeast Asia (Tokyo)**
   - Database Password：**自動生成を使い、パスワード管理アプリに保存する**。チャット・メモ・このリポジトリには書かない
   - Plan：Free（設計書のとおり、最初の入金までは無料で進める）
3. 作成が終わるまで1〜2分待つ

> 無料プロジェクトは1週間使わないと一時停止します。止まったら管理画面の **Restore** で戻せます。

## 2. schema.sql を流す

### 方法A：管理画面の SQL Editor（おすすめ・道具が不要）

1. 左のメニューの **SQL Editor** を開き、**New query** を押す
2. `supabase/schema.sql` の中身を**全部**貼り付ける
3. **Run** を押す
4. 下に `Success. No rows returned` と出れば完了。赤いエラーが出たら、手順6を見る

> 「破壊的な操作が含まれます」と確認が出たら、新しいプロジェクトに流す場合に限り、そのまま実行して構いません。

### 方法B：自分のパソコンから psql で流す

`psql`（PostgreSQL 16 以上のクライアント）が入っている場合の方法です。

1. 管理画面の上にある **Connect** を押し、**Session pooler** の接続文字列をコピーする
   （Direct connection は IPv6 専用で、家庭や会社の回線ではつながらないことがあります）
2. `.env.example` をコピーして `.env` を作り、`SUPABASE_DB_URL=` の行に貼る。`[YOUR-PASSWORD]` の部分は手順1のパスワードに置き換える。`.env` は git に入りません
3. 次のコマンドで流す。途中でエラーが出たら、そこで止まります

```bash
set -a; . ./.env; set +a
```

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

## 3. 正しく入ったか確かめる

SQL Editor で、次の3つを1つずつ実行します。

**テーブルが20個あり、すべてに行単位のアクセス制御（RLS）が付いているか**

```sql
select c.relname as テーブル, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

→ 20行出て、`rls` がすべて `true` なら合格。`false` が1つでもあれば、そのテーブルは誰でも読めてしまうので、使い始める前に知らせてください。

**設計書にある関数がそろっているか**

```sql
select p.proname as 関数
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('effective_plan','create_store','ops_set_plan','staff_limit','take_swap')
order by 1;
```

→ 5行出れば合格。

**ログインしていない人から中身が見えないか**

管理画面の **Table Editor** で `stores` などを開くと中が見えますが、これは管理者の権限で見ているためです。画面のコードから確かめるのは作業3で行います。

## 4. ログインの設定

1. **Authentication → Sign In / Providers**
   - **Email**：オン（店長がメールとパスワードで登録する）。「Confirm email」もオンのまま
   - **Allow anonymous sign-ins**：**オン**（スタッフが招待リンクだけで参加するため）
2. **Authentication → Attack Protection**（古い画面では Auth の設定の中）
   - **Enable CAPTCHA protection** をオンにし、Provider に **Cloudflare Turnstile** を選ぶ
   - Cloudflare の管理画面 → **Turnstile** → **Add widget** でサイトを作る。ドメインには、開発中は `localhost` を入れる
   - Cloudflare に出る **Secret Key** を Supabase の欄に貼る。**Site Key** はあとで画面に入れるので控えておく（Site Key は公開してよい値、Secret Key は公開してはいけない値です）
   - CAPTCHA をオンにすると、作業3で作る登録・ログインの画面が Turnstile の確認結果を一緒に送らないと、ログインできなくなります。作業3の前にオンにしても、今の画面には影響しません

## 5. 画面から使う値を .env に入れる

**Project Settings → API**（または **Connect** の中の **App Frameworks**）から、次の2つを `.env` に入れます。

```
VITE_SUPABASE_URL=https://（プロジェクトID）.supabase.co
VITE_SUPABASE_ANON_KEY=（anon public キー）
```

- anon キーはブラウザに配られる前提の値で、守りは手順3の RLS が担います
- **service_role キーは絶対に入れないでください。** RLS を素通りして全店舗のデータを読み書きできる鍵です。画面のコードにも `.env` にも置きません（運営者用の処理で必要になったら、Edge Function の秘密の設定に入れます）

## 6. うまくいかないとき

| 症状 | 原因と対処 |
|---|---|
| `already exists` のエラー | 一度途中まで流れています。検証用のプロジェクトなら、プロジェクトを作り直して最初から流すのが確実です |
| `permission denied` | SQL Editor ではなく、権限の弱い接続で流しています。方法Aで流し直してください |
| psql が `could not translate host name` | Direct connection の接続文字列を使っています。Session pooler の文字列に替えてください |
| psql が `password authentication failed` | 接続文字列の `[YOUR-PASSWORD]` を置き換え忘れているか、パスワードに `@` などの記号が入っています。記号は URL 用に変換するか、パスワードを作り直してください |

終わったら、手順3の2つの確認結果（テーブル数と `rls` の値、関数の数）を教えてください。作業3（店長の登録とログイン）に進みます。
