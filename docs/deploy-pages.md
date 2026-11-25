# Cloudflare Pages に置く（試すための仮の公開）

アプリを無料の `〜.pages.dev` のアドレスに置き、自分のブラウザで試せるようにします。
GitHub の `main` に新しいコミットが入るたびに、Cloudflare が自動で作り直します。

> このアドレスは、知っている人なら誰でも開けます。規約の事業者名などはまだ仮なので、お客様には知らせず、試すときだけ使ってください。

## 手順A：Cloudflare に GitHub をつなぐ（10分ほど）

1. ブラウザで `https://dash.cloudflare.com` を開く
2. 左のメニューの **Compute** →  **Workers & Pages** を押す（見つからなければ、上の検索欄に `Pages` と入れる）
3. 右上の **Create application**（作成）を押す
4. **Pages** のタブを選び、**Import an existing Git repository**（既存の Git リポジトリをインポート）の **Get started** を押す
   - 「Workers」の画面しか出ないときは、画面の下のほうにある「Looking to deploy Pages? **Get started**」を押す
5. **Connect GitHub** を押す。GitHub の画面に切り替わったら
   - アカウント **wanwandesign0705-bot** を選ぶ
   - **Only select repositories** → **smart-shift** を選ぶ
   - **Install & Authorize** を押す
6. Cloudflare に戻り、一覧から **smart-shift** を選んで **Begin setup** を押す
7. 次のように入れる

   | 項目 | 入れるもの |
   |---|---|
   | Project name | `smart-shift` |
   | Production branch | `main` |
   | Framework preset | `None`（なし） |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

8. 同じ画面の **Environment variables (advanced)**（環境変数）を開き、**Add variable** で次の3つを足す

   | Variable name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase の Project URL（`https://〜.supabase.co`） |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase の Publishable key（`sb_publishable_` で始まる） |
   | `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile の **Site Key**（Secret Key ではない） |

9. **Save and Deploy** を押す
10. 1〜3分待つ。「Success! Your project is deployed」と出たら、表示されたアドレス（`https://smart-shift.pages.dev` など）をメモする

✅ そのアドレスを開くと、Smart Shift の画面が出れば完了です。

## 手順B：ロボット対策に、このアドレスを足す

1. Cloudflare の左のメニューで **Turnstile** を開き、`smart-shift` のウィジェットを押す
2. **Settings**（設定）を開き、Hostnames に手順A-10 のアドレスの `https://` を除いた部分（例：`smart-shift.pages.dev`）を足す
3. **Save** を押す

## 手順C：Supabase に、戻ってくる先を教える

確認メールやパスワード再設定のリンクを押したときに、このアプリに戻ってくるための設定です。

1. Supabase で **Authentication** → 左の一覧の **URL Configuration** を開く
2. **Site URL** を、手順A-10 のアドレス（例：`https://smart-shift.pages.dev`）にして **Save**
3. **Redirect URLs** の **Add URL** で、次の2つを足す
   - `https://smart-shift.pages.dev/**`（手順A-10 のアドレスの後ろに `/**`）
   - `http://localhost:5173/**`（開発用）

## 手順D：試してみる

1. 手順A-10 のアドレスを開き、右上の **管理者メニュー** を押す
2. **はじめての方：新しく登録する** を押し、自分のメールアドレスとパスワードを入れる
3. 「私はロボットではありません」が ✓ になってから **登録する** を押す
4. 届いたメール（件名は英語の「Confirm Your Signup」）のリンクを押す
5. 規約に同意し、お店を作る
6. 管理画面が開けば成功です

> Supabase の無料の送信機能は、1時間に数通までで、Supabase の組織のメンバー（あなた）のメールアドレスにしか届きません。お客様向けに公開する前に、メール送信サービスを設定します（作業10）。
