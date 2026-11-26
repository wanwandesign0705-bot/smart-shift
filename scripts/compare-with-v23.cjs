// v2.3（1ファイル版）と Vite 版を同じ操作で動かし、各画面のスクリーンショットが一致するか比べる。
// 使い方（docs/verification.md も参照）：
//   npm run build:local                          ← Supabase を使わない版を作る（v2.3 と比べるのはこちら）
//   npx vite preview --port 4173 --strictPort    ← 別のターミナルで起動したままにする
//   npm run compare
// 引数で変えられる：node scripts/compare-with-v23.cjs [v2.3のHTML] [Vite版のURL] [画像の出力先]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [, , origFile = 'reference/smart-shift-v2.3.html', newUrl = 'http://localhost:4173', outDir = 'compare-output'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

// アーティファクトは本文の外側に最小の HTML を付けて配信していた。比較のため同じ形で包む
const skeleton = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
  // 2026-11-23 にアプリ名を「Smart Shift」に変えたので、基準の v2.3 も同じ名前に読み替えてから比べる
  + fs.readFileSync(origFile, 'utf8').replaceAll('Smart Shift Manager', 'Smart Shift')
      .replace('サービス「Smart Shift」（以下「本サービス」）', 'サービス「Smart Shift（スマートシフト）」（以下「本サービス」）')
  + '</body></html>';
const wrapped = path.join(outDir, '_v23.html');
fs.writeFileSync(wrapped, skeleton);

// 画面ごとの操作。どちらの版でも同じ関数を呼ぶ
const steps = [
  ['01-staff-picker', async p => {}],
  ['02-staff-myshift', async p => { await p.selectOption('#f_me', 't4'); }],
  ['03-staff-all', async p => { await p.click('button:has-text("全体のシフト")'); }],
  ['04-staff-request', async p => { await p.click('button:has-text("申請")'); }],
  ['05-staff-request-sent', async p => { await p.fill('#f_qd', '2026-12-10'); await p.click('button:has-text("申請する")'); await p.evaluate(() => { document.getElementById('toast').hidden = true; }); }],
  ['06-staff-notices', async p => { await p.click('button:has-text("社内連絡")'); }],
  ['07-lock', async p => { await p.click('text=管理者メニュー'); }],
  ['08-lock-wrong', async p => { await p.fill('#lkp', 'x'); await p.click('.lk-b'); await p.waitForTimeout(600); }],
  ['09-consent', async p => { await p.fill('#lkp', 'admin'); await p.click('.lk-b'); }],
  ['10-consent-checked', async p => { await p.check('#f_ag1'); await p.check('#f_ag2'); }],
  ['11-admin-shift', async p => { await p.click('button:has-text("同意して始める")'); await p.evaluate(() => { document.getElementById('toast').hidden = true; }); }],
  ['12-cell-editor', async p => { await p.evaluate(() => pick('t2', 5)); await p.waitForTimeout(400); }],
  ['13-requests', async p => { await p.evaluate(() => go(1)); }],
  ['14-approved', async p => { await p.click('button.b.ok:has-text("承認")'); await p.evaluate(() => { document.getElementById('toast').hidden = true; }); }],
  ['15-leave', async p => { await p.evaluate(() => go(2)); }],
  ['16-analysis', async p => { await p.evaluate(() => go(3)); }],
  ['17-notices', async p => { await p.evaluate(() => go(4)); }],
  ['18-settings', async p => { await p.evaluate(() => go(5)); }],
  ['19-template-modal', async p => { await p.selectOption('select[onchange^="askTpl"]', { index: 2 }); }],
  ['20-template-applied', async p => { await p.click('#md button.b'); await p.evaluate(() => go(0)); }],
  ['21-plan', async p => { await p.evaluate(() => go(6)); }],
  ['22-plan-yearly', async p => { await p.click('button:has-text("年払い（2ヶ月分お得）")'); }],
  ['23-reservations', async p => { await p.evaluate(() => { go(0); av = 'res'; render(); }); }],
  ['24-updates', async p => { await p.click('#hd button:has-text("アップデート情報")'); }],
  ['25-terms', async p => { await p.evaluate(() => openLegal('terms')); }],
  ['26-privacy', async p => { await p.evaluate(() => openLegal('privacy')); }],
  ['27-tokusho', async p => { await p.evaluate(() => openLegal('tokusho')); }],
  ['28-next-month', async p => { await p.evaluate(() => { go(0); av = 'shift'; render(); }); await p.click('button[aria-label="次の期間"]'); }],
  ['29-generated', async p => { await p.click('button:has-text("自動生成")'); }],
  ['30-published', async p => { await p.click('button:has-text("スタッフに公開")'); await p.evaluate(() => { document.getElementById('toast').hidden = true; }); }],
  // 再読み込みしても、保存した内容（公開・同意・承認した有給・テンプレート）が残っているか
  ['31-after-reload', async p => { await p.reload(); await p.waitForTimeout(500); }],
  ['32-after-reload-admin', async p => { await p.click('text=管理者メニュー'); await p.fill('#lkp', 'admin'); await p.click('.lk-b'); await p.evaluate(() => go(2)); }],
];

async function run(target, label, viewport, scheme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/, r => r.abort()); // 外部の読み込みは両方とも止めて条件を揃える
  // 申請日時の「秒」などで差が出ないよう、両方の時計を同じ時刻に固定する
  await p.clock.setFixedTime(new Date('2026-11-22T10:00:00+09:00'));
  await p.goto(target); await p.waitForTimeout(500);
  const shots = {}, htmls = {};
  for (const [name, act] of steps) {
    await act(p); await p.mouse.move(1, 1); await p.waitForTimeout(700); // マウスを外し、表示のアニメーション（0.35秒）が終わってから撮る
    shots[name] = await p.screenshot({ fullPage: true });
    // 画面の中身（アプリが描いた HTML）も取っておく。画像だけが違い中身が同じなら、ブラウザの描画の揺れ
    htmls[name] = await p.evaluate(() => ['hd', 'tabs', 'app', 'md', 'dr', 'toast'].map(id => { const e = document.getElementById(id); return e ? e.outerHTML : ''; }).join('\n'));
    fs.writeFileSync(path.join(outDir, `${label}-${name}.png`), shots[name]);
  }
  // ブラウザに保存された中身（申請の id は乱数なので除く）
  const saved = await p.evaluate(() => {
    const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = JSON.parse(localStorage.getItem(k)); }
    if (o.ssm7_reqs) o.ssm7_reqs = o.ssm7_reqs.map(({ id, ...r }) => r);
    return JSON.stringify(o, Object.keys(o).sort());
  });
  await browser.close();
  return { shots, htmls, errors, saved };
}

(async () => {
  const results = [];
  for (const [vp, scheme, tag] of [[{ width: 1280, height: 900 }, 'light', 'pc-light'], [{ width: 400, height: 860 }, 'dark', 'phone-dark']]) {
    const a = await run('file://' + path.resolve(wrapped), `v23-${tag}`, vp, scheme);
    const b = await run(newUrl, `vite-${tag}`, vp, scheme);
    // 意図した違いをそろえてから比べる：
    //  ・作業3から「管理者メニュー」は openAdmin() を呼ぶ（Supabase を使わない版では、中で今までと同じ showLock=true;render() をする）
    //  ・申請の番号（q + 時刻 + ランダム4文字）は毎回変わる
    const norm = h => h.replace(/onclick="openAdmin\(\)"/g, 'onclick="showLock=true;render()"').replace(/q\d{13}[a-z0-9]{1,4}/g, 'q*');
    for (const [name] of steps) results.push({ tag, name, same: a.shots[name].equals(b.shots[name]), sameHtml: norm(a.htmls[name]) === norm(b.htmls[name]) });
    results.push({ tag, name: '保存された中身（localStorage）', same: a.saved === b.saved });
    results.push({ tag, errorsV23: a.errors, errorsVite: b.errors });
  }
  const diffs = results.filter(r => r.same === false);
  const htmlDiffs = results.filter(r => r.sameHtml === false);
  const jitter = diffs.filter(r => r.sameHtml === true);
  console.log(`比較した画面: ${results.filter(r => 'same' in r).length}  画像が一致: ${results.filter(r => r.same).length}  画面の中身（HTML）が違う: ${htmlDiffs.length}`);
  jitter.forEach(d => console.log('  画像だけ違う（中身は同じ＝描画の揺れ）:', d.tag, d.name));
  htmlDiffs.forEach(d => console.log('  ★中身が違う:', d.tag, d.name));
  diffs.filter(r => !('sameHtml' in r)).forEach(d => console.log('  ★違う:', d.tag, d.name));
  results.filter(r => r.errorsV23).forEach(r => console.log(r.tag, 'エラー v2.3:', r.errorsV23, ' Vite:', r.errorsVite));
  // 失敗にするのは、中身が違うときと、保存の中身が違うときだけ
  process.exit(htmlDiffs.length || diffs.some(r => !('sameHtml' in r)) ? 1 : 0);
})();
