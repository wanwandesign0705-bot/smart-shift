# Supabase の準備と schema.sql の流し方（作業2）

この手順は、ご自身で操作していただく部分です。ブラウザだけで終わり、プログラムを入れる必要はありません。
所要時間は30分ほどです。1つ終わるごとに、「こうなっていればOK」を確かめてから次へ進んでください。

> **画面の名前について**：この手順を書いた環境からは supabase.com を開けなかったため、ボタンやメニューの名前は2026年時点の知識で書いています。名前が見つからないときは、Supabase の画面の上にある虫めがね（検索）に、手順に書いた英語の言葉を入れて探してください。

## 準備するもの

- [ ] パソコンのブラウザ（Chrome がおすすめ）
- [ ] パスワード管理アプリ、またはパスワードを安全に控えられる場所（紙のメモでも可。チャットやメールには書かない）
- [ ] `schema.sql` の中身（設計書に添付のもの）
- [ ] GitHub か Google のアカウント（Supabase の登録に使います）

---

## 手順1：Supabase に登録する

1. ブラウザで `https://supabase.com` を開く
2. 右上の **Start your project**（または **Sign in**）を押す
3. **Continue with GitHub** か、メールアドレスで登録する
4. 「組織（Organization）を作ってください」と出たら、次のように入れて **Create organization** を押す
   - Name：`smart-shift`
   - Type：`Personal`
   - Plan：`Free - $0/month`

✅ **こうなっていればOK**：「Projects」という画面が出て、まだプロジェクトが1つもない状態

## 手順2：プロジェクトを作る

1. **New project** を押す
2. 次のように入れる

   | 項目 | 入れるもの |
   |---|---|
   | Project name | `smart-shift-dev` |
   | Database Password | 右の **Generate a password** を押して自動で作る |
   | Region | `Northeast Asia (Tokyo)` |

3. **Database Password をコピーして、パスワード管理アプリに保存する**
   - このパスワードは、あとで画面からは見られません
   - チャット（Claude を含む）、メール、LINE には貼らないでください
4. **Create new project** を押す
5. 1〜2分待つ（「Setting up project」と出ている間は待つ）

✅ **こうなっていればOK**：プロジェクトの最初の画面（Project Overview）が出る

> 無料のプロジェクトは、1週間使わないと止まります。止まっていたら、プロジェクトを開いて **Restore project** を押せば戻ります。

## 手順3：schema.sql を流す

1. 左のメニューから **SQL Editor**（`>_` のような印）を押す
2. 左上の **＋**（または **New query**）を押す。白い入力欄が出る
3. `schema.sql` をメモ帳などで開き、**中身を全部コピー**する
   - Windows：`Ctrl` + `A` で全部選んでから `Ctrl` + `C`
   - Mac：`⌘` + `A` で全部選んでから `⌘` + `C`
4. Supabase の白い入力欄をクリックし、貼り付ける（`Ctrl` + `V` / `⌘` + `V`）
5. 右下の緑の **Run** を押す
6. 「このクエリは破壊的な操作を含みます」という確認が出たら、**Run this query** を押す
   （新しく作ったばかりのプロジェクトなので、消えて困るものはありません）

✅ **こうなっていればOK**：下の欄に `Success. No rows returned` と出る

❌ **赤い文字のエラーが出たら**：エラーの文章をそのままコピーして、Claude に貼ってください。パスワードは含まれていないので、貼って大丈夫です

## 手順4：正しく入ったか確かめる

手順3と同じ SQL Editor を使います。下の枠の文章を、**1つずつ**入れ替えて Run を押します。

1. 入力欄の中身を消す（`Ctrl` + `A` → `Delete`）
2. 次の文章を貼って **Run**

```sql
select c.relname as テーブル, c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

✅ **こうなっていればOK**：表が20行出て、右の `rls` の列がすべて `true`

3. もう一度入力欄の中身を消し、次の文章を貼って **Run**

```sql
select p.proname as 関数
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('effective_plan','create_store','ops_set_plan','staff_limit','take_swap')
order by 1;
```

✅ **こうなっていればOK**：表が5行出る

📝 **Claude に伝えること**：①の行数と、`rls` に `false` があったかどうか、②の行数。
`false` が1つでもあると、そのテーブルは誰でも読めてしまうので、作業3に進む前に直します。

## 手順5：スタッフの「招待リンクだけで参加」をオンにする

1. 左のメニューの **Authentication**（人の形の印）を押す
2. **Sign In / Providers**（古い画面では **Providers**）を押す
3. **Allow anonymous sign-ins** のスイッチを**オン**にして、**Save** を押す
4. 同じ画面の一覧で **Email** がオン（Enabled）になっていることを確かめる。**Confirm email** もオンのままにする

✅ **こうなっていればOK**：Allow anonymous sign-ins がオン、Email が Enabled

## 手順6：ロボットによる大量登録を防ぐ（Cloudflare Turnstile）

ここは少し長いので、時間があるときで構いません。作業3（ログイン画面づくり）の前までに終わっていれば大丈夫です。

**6-1. Cloudflare で鍵を作る**

1. `https://dash.cloudflare.com` を開き、アカウントを作る（無料）
2. 左のメニューの **Turnstile** を押す
3. **Add widget** を押し、次のように入れる
   - Widget name：`smart-shift`
   - Hostname：`localhost`（公開するときに、本番のドメインを足します）
   - Widget Mode：`Managed`
4. **Create** を押す
5. **Site Key** と **Secret Key** の2つが出る。両方をパスワード管理アプリに保存する
   - Site Key：画面に埋め込む値。人に見えても大丈夫です
   - Secret Key：**秘密の値**。チャットには貼らないでください

**6-2. Supabase に鍵を入れる**

1. Supabase に戻り、**Authentication** → **Attack Protection** を押す
2. **Enable Captcha protection** をオンにする
3. Choose Captcha Provider で **Turnstile by Cloudflare** を選ぶ
4. Captcha secret の欄に、6-1 の **Secret Key** を貼る
5. **Save** を押す

✅ **こうなっていればOK**：Captcha protection がオンで、Turnstile が選ばれている

> これをオンにすると、作業3で作るログイン画面が Turnstile の確認を通らないとログインできなくなります。今の画面（ブラウザ内保存の版）には影響しません。

## 手順7：あとで使う値を控える

1. 左下の歯車 **Project Settings** → **API**（または画面上の **Connect** ボタン）を開く
2. 次の2つをパスワード管理アプリに控える
   - **Project URL**（`https://〜.supabase.co` の形）
   - **anon public** と書かれた長いキー
3. **service_role** と書かれたキーは、**控えなくてよいし、どこにも貼らないでください**
   （これはすべての店舗のデータを読み書きできる鍵です。アプリの画面には絶対に入れません）

この2つの値は、作業3でアプリの設定ファイル（`.env`）に入れます。そのときの手順はまた1つずつお伝えします。

---

## 終わったら

Claude に次のように伝えてください。

```
Supabase の準備が終わりました。
手順4の①：〇行、rls に false は（ある／ない）
手順4の②：〇行
手順6（Turnstile）：（終わった／まだ）
```

---

## 付録：慣れている人向け（psql で流す方法）

ターミナルと PostgreSQL 16 以上の `psql` が使える場合は、SQL Editor の代わりにこちらでも流せます。初めての方は使わなくて大丈夫です。

1. Supabase の画面上の **Connect** → **Session pooler** の接続文字列をコピーする（Direct connection は IPv6 専用で、つながらないことが多い）
2. `.env.example` をコピーして `.env` を作り、`SUPABASE_DB_URL=` の行に貼る。`[YOUR-PASSWORD]` を手順2のパスワードに置き換える。`.env` は git に入りません
3. 次を実行する

```bash
set -a; . ./.env; set +a
```

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/schema.sql
```

| 症状 | 対処 |
|---|---|
| `already exists` | 途中まで流れています。検証用なら、プロジェクトを作り直して最初から流すのが確実です |
| `could not translate host name` | Direct connection の文字列です。Session pooler の文字列に替えてください |
| `password authentication failed` | `[YOUR-PASSWORD]` の置き換え忘れか、パスワードの `@` などの記号が原因です |
