# Smart Shift

シフト作成・労務管理アプリ。claude.ai のアーティファクト版（v2.3）を、本番用の Web アプリに移している途中です。
設計書：https://claude.ai/artifact/HGSh5Me5bMaYkWoJ7SvRkU

## 動かし方

```bash
npm install
npm run dev      # 開発用サーバー（http://localhost:5173）
npm run build    # 公開用のファイルを dist/ に作る
```

`.env.example` をコピーして `.env` を作り、Supabase の値を入れると、「管理者メニュー」が店長のログイン画面になります（`docs/account.md`）。
`.env` に値がないときは、管理者パスワード（初期値 `admin`）のロック画面で動きます（v2.3 と同じ）。

テスト：

```bash
npm run test:account   # 店長の登録・ログイン・お店の作成の流れ（Supabase への通信はテストが受け取る）
npm run test:cloud     # 管理画面のデータが Supabase に保存され、開き直しても残るか（作業4）
npm run test:schema    # schema.sql の守り（PostgreSQL 16 が必要）
```

## ファイルの構成

| 場所 | 中身 |
|---|---|
| `index.html` | 画面の外枠 |
| `src/main.js` | 入口。各ファイルを読み込んで起動する |
| `src/styles.css` | 見た目（v2.3 と同じ） |
| `src/config/` | 業種テンプレート・料金プラン（constants）、労務の基準値（law）、アップデート情報（updates）、規約の本文（legal） |
| `src/utils.js` `src/period.js` `src/plan.js` `src/calc.js` | 共通の小物、期間、プラン判定、シフト・人件費・労務・有給の計算 |
| `src/data.js` | **データ層**。読み込み・保存はすべてここを通す。ログイン中の店長は Supabase に、それ以外はこの端末に保存する（`docs/cloud-store.md`） |
| `src/state.js` | 店舗データのひな形と、画面どうしで共有する変数 |
| `src/export.js` | Excel 出力 |
| `src/views/account.js` | 店長のログイン・新規登録・規約への同意・お店の作成（作業3） |
| `src/views/` | 画面ごとのファイル（管理者の7タブ、スタッフ画面、シフト表、予約、アップデート情報と規約、ロック画面と全体の描画） |

### いまの書き方について
v2.3 は1つの `<script>` にすべてが入っていて、画面のボタンは `onclick="go(1)"` のように関数名だけで呼んでいました。
移植で動きを変えないため、`src/main.js` で各ファイルの関数を `window` に登録しています。
ファイル間の `import` への書き換えは、保存先を Supabase に替える作業と合わせて順に進めます。
