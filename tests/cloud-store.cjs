// 作業4のテスト：管理画面の操作が Supabase に保存され、ページを開き直しても残るか。
// 偽の Supabase（tests/fake-supabase.cjs）が送られた行を覚えておき、開き直したときに返す。
// 使い方：npm run test:cloud
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { createFake } = require('./fake-supabase.cjs');

const root = path.resolve(__dirname, '..');
const shotDir = path.join(root, 'compare-output', 'cloud');
fs.mkdirSync(shotDir, { recursive: true });
const PORT = 4176;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) { console.log('FAIL: ' + name + (detail ? ' — ' + String(detail).slice(0, 400) : '')); process.exitCode = 1; throw new Error(name); }
  passed++; console.log('PASS: ' + name);
}

(async () => {
  console.log('テスト用のビルドを作っています…');
  execSync("npx vite build --outDir dist-test --emptyOutDir", {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: 'https://test-project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', VITE_TURNSTILE_SITE_KEY: 'test-site-key' },
  });
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));

  const fake = createFake();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.route(/test-project\.supabase\.co/, fake.handle);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'ssm7' && /追加 太郎|木村 拓/.test(v)) console.log('LEAK ' + new Error().stack.split('\n').slice(1, 6).join(' | ')); return o.call(this, k, v); }; });
  // お店の名簿がこの端末の保存（ssm7）に書かれたら、その場で知らせる
  const leaks = [];
  page.on('console', m => { if (m.text().startsWith('LEAK')) leaks.push(m.text()); });
  await page.addInitScript(() => { window.turnstile = { render: (el, o) => { el.textContent = '（テスト用の確認 ✓）'; setTimeout(() => o.callback('t'), 20); } }; });
  const wait = (ms = 300) => page.waitForTimeout(ms);
  const shot = n => page.screenshot({ path: path.join(shotDir, n + '.png'), fullPage: false });
  const hd = () => page.textContent('#hd');
  const saved = async () => { for (let i = 0; i < 40; i++) { if ((await hd()).includes('保存済み')) return true; await wait(150); } return false; };
  const writes = () => fake.log.filter(r => r.path.startsWith('/rest/v1/') && r.method !== 'GET' && !r.path.includes('/rpc/')).length;
  // 中身を比べる（キーの並び順はそろえる）
  const gridOf = () => page.evaluate(() => {
    const canon = v => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
    // 消したスタッフの古いシフトは、画面にだけ残ることがある（保存はされない）ので、今いるスタッフの分だけを比べる
    const ids = new Set(S.staff.map(x => x.id)), keep = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => ids.has(k)));
    const memo = Object.fromEntries(Object.entries(S.memo || {}).filter(([k, v]) => v && ids.has(k.slice(0, k.lastIndexOf('_')))));
    const wish = Object.fromEntries(Object.entries(keep(S.wish)).map(([k, d]) => [k, Object.fromEntries(Object.entries(d).filter(([, v]) => v))]).filter(([, d]) => Object.keys(d).length));
    return JSON.stringify(canon({ grid: keep(S.grid), wish, memo, pub: S.pubUntil }));
  });
  const openAdmin = async () => { await page.click('text=管理者メニュー'); await wait(1200); };
  const reload = async () => { await page.reload(); await wait(1500); await openAdmin(); };
  const db = fake.db;

  try {
    await page.goto(`http://localhost:${PORT}/`); await wait(800);

    console.log('\n== お店を作る（作業3の流れ）==');
    await openAdmin();
    await page.fill('#f_ae', 'tencho@example.com'); await page.fill('#f_ap', fake.password); await wait(100);
    await page.click('button.lk-b'); await wait(1200);
    await page.check('#f_ag1'); await page.check('#f_ag2'); await page.click('button.lk-b'); await wait(1200);
    await page.fill('#f_sn', '居酒屋テスト');
    await page.click('button.lk-b'); await wait(1500);
    ok('お店を作ると、管理画面に入る', !!(await page.$('#tabs .tab')));
    ok('保存が終わると「保存済み」と出る', await saved());
    ok('今月のシフトが自動作成され、Supabase に保存される', db.shift_assignments.length > 100, db.shift_assignments.length);
    const typeIds = new Set(db.shift_types.map(x => x.id)), staffIds = new Set(db.staff.map(x => x.id));
    ok('保存したシフトは、すべて名簿のスタッフと、実在するシフト区分を指している',
      db.shift_assignments.every(c => staffIds.has(c.staff_id) && (c.shift_type_id === null || typeIds.has(c.shift_type_id))));
    await page.evaluate(() => { document.getElementById('toast').hidden = true; });
    await shot('01-admin-saved');

    console.log('\n== 開き直しても残る ==');
    const before = await gridOf();
    await reload();
    ok('ページを開き直すと、Supabase から同じシフトが読み込まれる', (await gridOf()) === before);
    ok('名簿と時給も同じ', await page.evaluate(() => S.staff.length === 8 && S.staff[0].name === '田中 健一' && S.staff[0].wage === 1500));

    console.log('\n== シフトの編集 ==');
    const sid = await page.evaluate(() => S.staff[2].id), late = await page.evaluate(() => S.shifts[3].id);
    let w0 = writes();
    await page.evaluate(([s]) => { pick(s, 5); }, [sid]); await wait(300);
    await page.evaluate(([v]) => setSh(v), [late]);
    ok('セルを変えると保存される', await saved());
    const cellWrites = fake.log.slice(-5).filter(r => r.method === 'POST' && r.path === '/rest/v1/shift_assignments');
    ok('送るのは、変えた1日分の1行だけ', writes() - w0 === 1 && cellWrites.length === 1 && cellWrites[0].body.length === 1 && cellWrites[0].body[0].shift_type_id === late,
      JSON.stringify(fake.log.slice(-3).map(r => [r.method, r.path, Array.isArray(r.body) ? r.body.length : r.body])));
    w0 = writes();
    await page.evaluate(() => { togWish(); setMemo('10時出勤'); });
    ok('希望休とメモを、続けて変えても', await saved());
    ok('通信は1回にまとまる', writes() - w0 === 1, writes() - w0);
    await page.evaluate(() => setSh('PL')); await saved();
    const cell = db.shift_assignments.find(c => c.staff_id === sid && /-05$/.test(c.work_date));
    ok('有給・希望休・メモが、1日の行に入る', cell && cell.leave === 'full' && cell.wish_off === true && cell.memo === '10時出勤', JSON.stringify(cell));

    console.log('\n== 設定 ==');
    w0 = writes();
    await page.evaluate(() => { U('need.0', 7, 1); U('budget', 2000000, 1); U('rules.maxRun', 5, 1); });
    await saved();
    const st = db.store_settings[0];
    ok('必要人数・予算・連勤の上限が、お店の設定に入る', st.need[0] === 7 && st.budget === 2000000 && st.rules.maxRun === 5, JSON.stringify(st));
    ok('設定だけを変えたときは、設定の1行だけを送る', writes() - w0 === 1, writes() - w0);
    await page.evaluate(() => { U('company', 'large'); U('deadline', 15, 1); }); await saved();
    ok('従業員数と締切日は、お店の行に入る', db.stores[0].company_size === 'large' && db.stores[0].request_deadline === 15);

    console.log('\n== 名簿 ==');
    await page.evaluate(() => addStaff()); await saved();
    const added = db.staff.find(s => s.name === '新規スタッフ');
    ok('スタッフを足すと、UUID の ID で名簿と時給に入る', added && UUID.test(added.id) && db.staff_private.some(w => w.staff_id === added.id && w.wage === 1100));
    await page.evaluate(() => { const i = S.staff.findIndex(s => s.name === '新規スタッフ'); U('staff.' + i + '.name', '木村 拓'); U('staff.' + i + '.wage', 1250, 1); }); await saved();
    ok('名前と時給の変更が入る', db.staff.some(s => s.id === added.id && s.name === '木村 拓') && db.staff_private.some(w => w.staff_id === added.id && w.wage === 1250));
    const victim = await page.evaluate(() => S.staff[7].id);
    const victimCells = db.shift_assignments.filter(c => c.staff_id === victim).length;
    await page.evaluate(() => { S.staff.splice(7, 1); save(); render(); }); await saved();
    ok('スタッフを消すと、名簿・時給・そのスタッフのシフトが消える',
      victimCells > 0 && !db.staff.some(s => s.id === victim) && !db.staff_private.some(w => w.staff_id === victim) && !db.shift_assignments.some(c => c.staff_id === victim));

    console.log('\n== シフト区分 ==');
    await page.evaluate(() => { S.shifts.push({ id: 's' + Date.now(), name: '新区分', time: '09:00-18:00', color: '#FEE2E2', min: 0 }); save(); render(); }); await saved();
    const nt = db.shift_types.find(x => x.name === '新区分');
    ok('区分を足すと、UUID の ID で入り、画面の ID も付け替わる', nt && UUID.test(nt.id) && (await page.evaluate(() => S.shifts.every(x => /^[0-9a-f-]{36}$/.test(x.id)))));

    console.log('\n== 公開 ==');
    await page.click('button:has-text("スタッフに公開")'); await saved();
    ok('公開すると、公開した期間が入る', db.shift_publications.length === 1 && db.shift_publications[0].end_date.endsWith('-30'), JSON.stringify(db.shift_publications));
    await page.click('button:has-text("公開を取り消す")'); await saved();
    ok('取り消すと、前の月の末日までに戻る', db.shift_publications.length === 1 && db.shift_publications[0].end_date.endsWith('-31'), JSON.stringify(db.shift_publications));

    console.log('\n== 1000行を超えるシフト ==');
    for (let i = 0; i < 4; i++) { await page.click('button[aria-label="次の期間"]'); await page.click('button:has-text("自動生成")'); await wait(200); }
    await saved();
    ok('5ヶ月分で1000行を超える', db.shift_assignments.length > 1000, db.shift_assignments.length);
    const many = await gridOf();
    await reload();
    const cnt = () => page.evaluate(() => ({ cells: Object.values(S.grid).reduce((a, d) => a + Object.keys(d).length, 0), wish: Object.values(S.wish).reduce((a, d) => a + Object.values(d).filter(Boolean).length, 0), memo: Object.keys(S.memo).length }));
    const c2 = await cnt(), m2 = JSON.parse(many);
    ok('1000行を超えても、開き直すと全部読み込まれる', (await gridOf()) === many,
      JSON.stringify(c2) + ' DB=' + db.shift_assignments.length + ' before=' + Object.values(m2.grid).reduce((a, d) => a + Object.keys(d).length, 0) + ' pub ' + m2.pub + '/' + JSON.parse(await gridOf()).pub);

    console.log('\n== 業種テンプレートの切り替え ==');
    await page.evaluate(() => go(5)); await wait(200);
    await page.selectOption('select[onchange^="askTpl"]', { index: 2 }); await wait(200);
    await page.click('#md button.b'); await saved();
    ok('切り替えると、名簿とシフト区分が新しい業種のものになる',
      db.staff.length === 11 && db.shift_types.map(x => x.name).join() === '早出,日勤,遅出,夜勤,休み', db.staff.length + ' ' + db.shift_types.map(x => x.name));
    ok('画面にも Supabase にも、仮の ID（t0 など）が残らない',
      db.staff.every(s => UUID.test(s.id)) && (await page.evaluate(() => S.staff.every(s => /^[0-9a-f-]{36}$/.test(s.id)) && Object.keys(S.grid).every(k => /^[0-9a-f-]{36}$/.test(k)))));
    const afterTpl = await gridOf();
    await reload();
    ok('切り替えたあとも、開き直すと同じ', (await gridOf()) === afterTpl && (await page.evaluate(() => S.industry.startsWith('介護'))));

    console.log('\n== 保存できなかったとき ==');
    fake.fail.staff = 'staff_limit_exceeded: free プランのスタッフ上限は 5 名です';
    await page.evaluate(() => addStaff()); await wait(1500);
    ok('「保存できません」と出て、理由を知らせる', (await hd()).includes('保存できません') && (await page.textContent('#toast')).includes('スタッフ上限'));
    await shot('02-save-error');
    await page.evaluate(() => { const i = S.staff.length - 1; U('staff.' + i + '.name', '追加 太郎'); });
    ok('次の変更のときに送り直して、保存できる', (await saved()) && db.staff.some(s => s.name === '追加 太郎'));

    console.log('\n== ログアウト ==');
    await page.click('#hd button:has-text("ログアウト")'); await wait(1000);
    ok('ログアウトすると、画面から店のデータが消える', await page.evaluate(() => !S.staff.some(s => s.name === '追加 太郎')));
    // お店にしかない名前で探す（この端末のサンプルデータにも時給1250円の人がいるため、金額では探さない）
    const leftover = await page.evaluate(() => Object.keys(localStorage).filter(k => /追加 太郎|木村 拓/.test(localStorage.getItem(k) || '')));
    ok('この端末には、お店の名簿や時給が残らない', leftover.length === 0, leftover.join(', ') + ' ' + await page.evaluate(k => (localStorage.getItem(k) || '').slice(0, 300), leftover[0] || ''));

    ok('テストの間、一度もこの端末の保存にお店の名簿が書かれなかった', leaks.length === 0, leaks.join(' / '));
    ok('画面のエラーは0件', errors.length === 0, errors.join(' / '));
    console.log(`\nすべてのテストに合格しました（${passed}項目）`);
  } catch (e) {
    if (!process.exitCode) { console.log('FAIL: ' + e.message); process.exitCode = 1; }
  } finally {
    await browser.close(); server.kill();
  }
})();
