// 作業6のテスト：スタッフの申請 → 店長の承認 → シフトに反映、交代の募集と引き受け、社内連絡と既読。
// 店長のパソコンと、スタッフ2人（山田・伊藤）のスマホを、別々のブラウザとして同時に動かす。
// 使い方：npm run test:requests
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { createFake } = require('./fake-supabase.cjs');

const root = path.resolve(__dirname, '..');
const shotDir = path.join(root, 'compare-output', 'requests');
fs.mkdirSync(shotDir, { recursive: true });
const PORT = 4181;
let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) { console.log('FAIL: ' + name + (detail ? ' — ' + String(detail).slice(0, 500) : '')); process.exitCode = 1; throw new Error(name); }
  passed++; console.log('PASS: ' + name);
}

(async () => {
  console.log('テスト用のビルドを作っています…');
  execSync('npx vite build --outDir dist-test --emptyOutDir', {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: 'https://test-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', VITE_TURNSTILE_SITE_KEY: 'test-site-key' },
  });
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));

  const fake = createFake(), db = fake.db, errors = [];
  const browser = await chromium.launch();
  async function device(name, viewport = { width: 1280, height: 1000 }) {
    const ctx = await browser.newContext({ viewport, locale: 'ja-JP' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.route(/test-project\.supabase\.co/, fake.handle);
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(() => { window.turnstile = { render: (el, o) => { el.textContent = '（テスト用の確認 ✓）'; setTimeout(() => o.callback('t'), 20); } }; });
    return page;
  }
  const wait = (p, ms = 400) => p.waitForTimeout(ms);
  const text = p => p.textContent('#app');
  const saved = async p => { for (let i = 0; i < 40; i++) { if ((await p.textContent('#hd')).includes('保存済み')) return true; await wait(p, 150); } return false; };
  const hideToast = p => p.evaluate(() => { document.getElementById('toast').hidden = true; });

  const owner = await device('店長');
  try {
    console.log('\n== 準備：お店を作り、今月と来月を公開し、2人を招待する ==');
    await owner.goto(`http://localhost:${PORT}/`); await wait(owner, 800);
    await owner.click('text=管理者メニュー'); await wait(owner, 500);
    await owner.fill('#f_ae', 'tencho@example.com'); await owner.fill('#f_ap', fake.password); await wait(owner, 100);
    await owner.click('button.lk-b'); await wait(owner, 1200);
    await owner.check('#f_ag1'); await owner.check('#f_ag2'); await owner.click('button.lk-b'); await wait(owner, 1200);
    await owner.fill('#f_sn', '居酒屋テスト'); await owner.click('button.lk-b'); await wait(owner, 1500);
    await saved(owner);
    await owner.click('button:has-text("スタッフに公開")'); await saved(owner);
    await owner.click('button[aria-label="次の期間"]'); await owner.click('button:has-text("自動生成")'); await saved(owner);
    await owner.click('button:has-text("スタッフに公開")'); await saved(owner);
    const ids = await owner.evaluate(() => ({ yamada: S.staff.find(s => s.name === '山田 花子').id, ito: S.staff.find(s => s.name === '伊藤 翔').id }));
    // 交代に使う日：来月で、山田さんが出勤・伊藤さんが休みの日
    const swapDay = await owner.evaluate(({ yamada, ito }) => Object.keys(S.grid[yamada]).sort().find(d => d >= iso(todayD()) && isWork(S.grid[yamada][d]) && !isWork((S.grid[ito] || {})[d])), ids);
    const plDay = await owner.evaluate(({ yamada, sd }) => Object.keys(S.grid[yamada]).sort().find(d => d >= iso(todayD()) && d !== sd && isWork(S.grid[yamada][d])), { ...ids, sd: swapDay });
    ok('交代と有給に使う日が見つかる', !!swapDay && !!plDay, swapDay + ' ' + plDay);
    const join = async (staffId, label) => {
      await owner.evaluate(() => go(5)); await wait(owner, 800);
      await owner.evaluate(id => issueInvite(id), staffId); await wait(owner, 1200);
      const url = await owner.inputValue('#inv-url');
      await owner.click('#md button:has-text("閉じる")'); await wait(owner);
      const p = await device(label, { width: 390, height: 844 });
      await p.goto(url); await wait(p, 1000); await p.click('button.lk-b'); await wait(p, 2500);
      return p;
    };
    const yamada = await join(ids.yamada, '山田のスマホ'), ito = await join(ids.ito, '伊藤のスマホ');
    ok('2人とも参加した', (await yamada.textContent('#hd')).includes('スタッフとして参加中') && (await ito.textContent('#hd')).includes('スタッフとして参加中'));

    console.log('\n== 山田：有給と希望休を申請する ==');
    await yamada.click('button:has-text("申請")'); await wait(yamada);
    ok('申請の画面が使える（「まもなく」ではない）', (await text(yamada)).includes('申請する') && !(await text(yamada)).includes('まもなく'));
    await yamada.selectOption('#f_qt', 'pl'); await wait(yamada, 200);
    await yamada.fill('#f_qd', plDay); await yamada.fill('#f_qr', '通院のため');
    await yamada.click('button:has-text("申請する")'); await wait(yamada, 1000);
    const pl = db.requests.find(q => q.kind === 'pl');
    ok('有給の申請が、理由と一緒に Supabase に入る', pl && pl.staff_id === ids.yamada && pl.status === 'pending' && pl.reason === '通院のため' && pl.work_date === plDay, JSON.stringify(pl));
    ok('山田の画面に「承認待ち」で出る', (await text(yamada)).includes('承認待ち'));
    await yamada.selectOption('#f_qt', 'off'); await wait(yamada, 200);
    await yamada.fill('#f_qd', '2026-12-31'); await yamada.fill('#f_qr', '帰省');
    await yamada.click('button:has-text("申請する")'); await wait(yamada, 1000);
    ok('希望休の申請も入る', db.requests.some(q => q.kind === 'off' && q.work_date === '2026-12-31'));
    await hideToast(yamada);
    await yamada.screenshot({ path: path.join(shotDir, '01-staff-request.png'), fullPage: true });

    console.log('\n== 山田：交代を募集する／伊藤：引き受ける ==');
    await yamada.selectOption('#f_qt', 'swap'); await wait(yamada, 300);
    await yamada.selectOption('#f_qs', swapDay); await yamada.fill('#f_qr', '家族の用事');
    await yamada.click('button:has-text("募集を出す")'); await wait(yamada, 1000);
    const sw = db.requests.find(q => q.kind === 'swap');
    ok('交代の募集が入る', sw && sw.status === 'open' && sw.work_date === swapDay && !!sw.shift_type_id);
    await ito.evaluate(() => refreshCloudRequests()); await wait(ito, 500);
    await ito.click('button:has-text("申請")'); await wait(ito);
    const itoText = await text(ito);
    ok('伊藤の画面に、山田さんの募集が出る（名前・日付）', itoText.includes('交代できる人を探しています') && itoText.includes('山田 花子'));
    ok('伊藤の画面には、山田さんの申請の理由が出ない（通院・帰省・家族の用事）', !/通院|帰省|家族の用事/.test(itoText));
    ok('伊藤の端末には、山田さんの有給や希望休の申請そのものが届かない', await ito.evaluate(() => !R.some(r => r.type === 'pl' || r.type === 'off')));
    await ito.click('button:has-text("引き受ける")'); await wait(ito, 1000);
    ok('引き受けると「承認待ち」になる', db.requests.find(q => q.id === sw.id).status === 'pending' && db.requests.find(q => q.id === sw.id).taker_staff_id === ids.ito);
    ok('伊藤の画面に「引き受けた交代」が出る', (await text(ito)).includes('引き受けた交代'));
    await yamada.evaluate(() => refreshCloudRequests()); await wait(yamada, 500);
    ok('山田の画面に「伊藤 翔 が引き受け」と出る', (await text(yamada)).includes('伊藤 翔'));

    console.log('\n== 店長：承認・却下する ==');
    await owner.evaluate(() => { go(1); refreshCloudRequests(); }); await wait(owner, 800);
    const ot = await text(owner);
    ok('店長の画面に、3件の申請が届く（理由も見える）', ot.includes('承認待ち') && ot.includes('通院のため') && ot.includes('帰省') && (await owner.$$('#app button.b.ok:has-text("承認")')).length === 3);
    await owner.screenshot({ path: path.join(shotDir, '02-owner-requests.png'), fullPage: true });
    await owner.evaluate(id => approve(id), pl.id); await saved(owner); await wait(owner, 500);
    ok('有給を承認すると、状態が承認済みになり、シフト表に有給が入る',
      db.requests.find(q => q.id === pl.id).status === 'approved' && db.shift_assignments.some(c => c.staff_id === ids.yamada && c.work_date === plDay && c.leave === 'full'));
    await owner.evaluate(id => approve(id), sw.id); await saved(owner); await wait(owner, 500);
    const typeOf = (sid, d) => (db.shift_assignments.find(c => c.staff_id === sid && c.work_date === d) || {}).shift_type_id;
    ok('交代を承認すると、2人のシフトが入れ替わる', typeOf(ids.ito, swapDay) === sw.shift_type_id && typeOf(ids.yamada, swapDay) !== sw.shift_type_id);
    const off = db.requests.find(q => q.kind === 'off');
    await owner.fill('#f_rj_' + off.id, 'その日は人手が足りません');
    await owner.evaluate(id => reject(id), off.id); await wait(owner, 800);
    ok('却下すると、理由のひとことと一緒に残る', db.requests.find(q => q.id === off.id).status === 'rejected' && db.requests.find(q => q.id === off.id).note === 'その日は人手が足りません');

    console.log('\n== スタッフに結果が届く ==');
    await yamada.reload(); await wait(yamada, 2500); await yamada.click('button:has-text("申請")'); await wait(yamada);
    const yt = await text(yamada);
    ok('山田の画面に「承認済み」「却下」と、店長のひとことが出る', yt.includes('承認済み') && yt.includes('却下') && yt.includes('その日は人手が足りません'));
    await ito.reload(); await wait(ito, 2500); await ito.click('button:has-text("申請")'); await wait(ito);
    ok('伊藤の「引き受けた交代」も承認済みになる', (await text(ito)).includes('引き受けた交代') && (await text(ito)).includes('承認済み'));
    await ito.click('button:has-text("マイシフト")'); await ito.click('button[aria-label="次の期間"]'); await wait(ito);
    ok('伊藤のマイシフトに、引き受けた日のシフトが出る', await ito.evaluate(d => isWork((S.grid[me] || {})[d]), swapDay));

    console.log('\n== 取り消し ==');
    await yamada.selectOption('#f_qt', 'pl'); await wait(yamada, 200);
    await yamada.fill('#f_qd', '2026-12-30'); await yamada.click('button:has-text("申請する")'); await wait(yamada, 1000);
    const pl2 = db.requests.find(q => q.work_date === '2026-12-30');
    await yamada.evaluate(id => cancelReq(id), pl2.id); await wait(yamada, 800);
    ok('スタッフは承認待ちの申請を取り消せる', db.requests.find(q => q.id === pl2.id).status === 'canceled');

    console.log('\n== 社内連絡と既読 ==');
    await owner.evaluate(() => go(4)); await wait(owner, 500);
    await owner.fill('#f_nt', '年末年始の営業時間'); await owner.fill('#f_nb', '12/31は17時閉店です');
    await owner.click('button:has-text("配信する")'); await saved(owner);
    ok('社内連絡が Supabase に入る（UUID の ID）', db.announcements.some(a => a.title === '年末年始の営業時間' && /^[0-9a-f-]{36}$/.test(a.id)));
    ok('サンプルの社内連絡は、お店には入らない', !db.announcements.some(a => a.title.includes('サンプル')));
    await yamada.reload(); await wait(yamada, 2500);
    ok('山田のスマホの「社内連絡」タブに、読んでいない数が出る', await yamada.evaluate(() => [...document.querySelectorAll('#app button')].some(b => b.textContent.startsWith('社内連絡') && b.querySelector('.dot'))));
    await yamada.click('button:has-text("社内連絡")'); await wait(yamada, 1200);
    ok('開くと読める', (await text(yamada)).includes('12/31は17時閉店です'));
    ok('既読が記録される', db.announcement_reads.length === 1 && db.announcement_reads[0].staff_id === ids.yamada);
    await yamada.click('button:has-text("マイシフト")'); await yamada.click('button:has-text("社内連絡")'); await wait(yamada, 800);
    ok('もう一度開いても、既読は1件のまま', db.announcement_reads.length === 1);
    await owner.evaluate(() => { noticeReads = null; render(); }); await wait(owner, 800);
    ok('店長の画面に「既読 1人」と出る', (await text(owner)).includes('既読 1人'));
    await owner.screenshot({ path: path.join(shotDir, '03-owner-notices.png'), fullPage: true });
    await owner.reload(); await wait(owner, 1500); await owner.click('text=管理者メニュー'); await wait(owner, 1500); await owner.evaluate(() => go(4)); await wait(owner, 800);
    ok('開き直しても、社内連絡が残っている', (await text(owner)).includes('年末年始の営業時間'));

    ok('どの端末でも画面のエラーは0件', errors.length === 0, errors.join(' / '));
    console.log(`\nすべてのテストに合格しました（${passed}項目）`);
  } catch (e) {
    if (!process.exitCode) { console.log('FAIL: ' + e.message); process.exitCode = 1; }
  } finally { await browser.close(); server.kill(); }
})();
