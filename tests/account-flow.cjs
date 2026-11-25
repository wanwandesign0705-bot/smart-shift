// 店長のアカウント（作業3）の流れのテスト。
// 本物の Supabase には送らず、通信をこのテストが受け取って、送られた中身を確かめる。
// （この環境からは確認メールを受け取れず、ロボット対策も通れないため）
//
// 使い方：npm run test:account
//   中で「テスト用のビルド（dist-test/）」を作り、vite preview で開いて確かめる。
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const root = path.resolve(__dirname, '..');
const shotDir = path.join(root, 'compare-output', 'account');
fs.mkdirSync(shotDir, { recursive: true });
const SB = 'https://test-project.supabase.co';
const PORT = 4174;

let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) { console.log('FAIL: ' + name + (detail ? ' — ' + detail : '')); process.exitCode = 1; throw new Error(name); }
  passed++; console.log('PASS: ' + name);
}

// ---- 偽の Supabase ----
function fakeJwt(sub) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, is_anonymous: false }) + '.sig';
}
const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'tencho@example.com', aud: 'authenticated', role: 'authenticated', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const db = { consents: [], store: null, requests: [] };
function session() { return { access_token: fakeJwt(USER.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user: USER }; }

async function handle(route) {
  const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
  let body = null; try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
  db.requests.push({ method, path: p, search: url.search, body });
  const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (p === '/auth/v1/signup') return json(200, { ...USER, email: body.email, email_confirmed_at: null, identities: [{}] });
  if (p === '/auth/v1/token') {
    if (body.password !== 'Tencho2026') return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, session());
  }
  if (p === '/auth/v1/user') return json(200, USER);
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
  if (p === '/auth/v1/recover') return json(200, {});
  if (p === '/rest/v1/consents' && method === 'GET') return json(200, db.consents);
  if (p === '/rest/v1/consents' && method === 'POST') { db.consents.push(...body); return route.fulfill({ status: 201, body: '' }); }
  if (p === '/rest/v1/store_members') return json(200, db.store ? [{ store_id: db.store.id, stores: db.store }] : []);
  if (p === '/rest/v1/rpc/create_store') { db.store = { id: '22222222-2222-4222-8222-222222222222', name: body.p_name, industry: body.p_industry, company_size: body.p_company_size }; return json(200, db.store.id); }
  if (['/rest/v1/shift_types', '/rest/v1/staff', '/rest/v1/staff_private'].includes(p)) return route.fulfill({ status: 201, body: '' });
  if (p === '/rest/v1/store_settings') return route.fulfill({ status: 204, body: '' });
  return json(404, { msg: 'テストで用意していない通信: ' + method + ' ' + p });
}
const sent = (p, method) => db.requests.filter(r => r.path === p && (!method || r.method === method));

(async () => {
  console.log('テスト用のビルドを作っています…');
  execSync('npx vite build --outDir dist-test --emptyOutDir', {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, VITE_SUPABASE_URL: SB, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', VITE_TURNSTILE_SITE_KEY: 'test-site-key' },
  });
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/test-project\.supabase\.co/, handle);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  // Turnstile の代わり：枠を描いて、すぐに「確認済み」のトークンを返す
  await page.addInitScript(() => {
    window.turnstile = { render: (el, o) => { el.textContent = '（テスト用：ロボットではない確認 ✓）'; setTimeout(() => o.callback('test-captcha-token'), 20); } };
  });
  const shot = n => page.screenshot({ path: path.join(shotDir, n + '.png'), fullPage: true });
  const text = () => page.textContent('#app');
  const wait = (ms = 300) => page.waitForTimeout(ms);

  try {
    await page.goto(`http://localhost:${PORT}/`); await wait(800);

    console.log('\n== ログイン画面 ==');
    await page.click('text=管理者メニュー'); await wait();
    ok('管理者メニューを押すと、パスワードのロックではなくログイン画面になる', (await text()).includes('店長のログイン') && !(await page.$('#lkp')));
    ok('ロボット対策の枠が出る', (await page.textContent('#ts')).includes('確認'));
    await shot('01-login');

    console.log('\n== 新規登録 ==');
    await page.click('text=はじめての方：新しく登録する'); await wait();
    await page.fill('#f_ae', 'tencho@example.com'); await page.fill('#f_ap', 'short'); await page.fill('#f_ap2', 'short');
    await page.click('button.lk-b'); await wait();
    ok('短いパスワードは登録前に止める', (await text()).includes('8文字以上'));
    ok('止めたときは Supabase に送らない', sent('/auth/v1/signup').length === 0);
    await page.fill('#f_ap', 'Tencho2026'); await page.fill('#f_ap2', 'Tencho2027'); await wait(100);
    await page.click('button.lk-b'); await wait();
    ok('確認用のパスワードが違うと止める', (await text()).includes('一致しません'));
    await page.fill('#f_ap2', 'Tencho2026'); await wait(100);
    await shot('02-signup');
    await page.click('button.lk-b'); await wait(800);
    const su = sent('/auth/v1/signup')[0];
    ok('登録の通信に、メール・パスワード・ロボット対策のトークンが入る',
      su && su.body.email === 'tencho@example.com' && su.body.password === 'Tencho2026' && su.body.gotrue_meta_security && su.body.gotrue_meta_security.captcha_token === 'test-captcha-token',
      JSON.stringify(su && su.body));
    ok('確認メールのリンクの戻り先が、このアプリになっている', su && /redirect_to=http%3A%2F%2Flocalhost%3A4174/.test(su.search), su && su.search);
    ok('「確認メールを送りました」の画面になる', (await text()).includes('確認メールを送りました') && (await text()).includes('tencho@example.com'));
    await shot('03-email-sent');

    console.log('\n== ログイン ==');
    await page.click('text=ログイン画面に戻る'); await wait();
    await page.fill('#f_ae', 'tencho@example.com'); await page.fill('#f_ap', 'machigai1');
    await page.click('button.lk-b'); await wait(800);
    ok('パスワードが違うと、日本語で知らせる', (await text()).includes('メールアドレスかパスワードが違います'));
    const tk = sent('/auth/v1/token')[0];
    ok('ログインの通信にもロボット対策のトークンが入る', tk && tk.body.gotrue_meta_security && tk.body.gotrue_meta_security.captcha_token === 'test-captcha-token');
    await wait(100);
    await page.fill('#f_ap', 'Tencho2026');
    await page.click('button.lk-b'); await wait(1200);
    ok('初めてのログインのあとは、規約への同意の画面になる', (await text()).includes('ご利用を始める前に'));
    await shot('04-consent');

    console.log('\n== 規約への同意 ==');
    await page.click('button.lk-b'); await wait();
    ok('チェックしないと進めない', (await text()).includes('両方にチェック') && db.consents.length === 0);
    await page.click('button.au-a:has-text("利用規約")'); await wait();
    ok('同意の画面から利用規約を開ける', (await text()).includes('第1条'));
    await page.click('#app button:has-text("戻る")'); await wait();
    ok('規約を閉じると同意の画面に戻る', (await text()).includes('ご利用を始める前に'));
    await page.check('#f_ag1'); await page.check('#f_ag2');
    await page.click('button.lk-b'); await wait(1200);
    ok('同意は利用規約とプライバシーポリシーの2件、版つきで記録される',
      db.consents.length === 2 && db.consents.every(c => c.user_id === USER.id && c.version === '2026-11-17') && db.consents.map(c => c.document).sort().join() === 'privacy,terms',
      JSON.stringify(db.consents));
    ok('同意のあとは、お店を作る画面になる', (await text()).includes('お店を作る'));
    await shot('05-create-store');

    console.log('\n== お店の作成 ==');
    await page.click('button.lk-b'); await wait();
    ok('お店の名前がないと止める', (await text()).includes('お店の名前を入れてください') && sent('/rest/v1/rpc/create_store').length === 0);
    await page.fill('#f_sn', 'グループホームさくら');
    await page.selectOption('#f_si', '介護施設・グループホーム（24時間3交代）');
    await page.selectOption('#f_ss', 'large');
    await page.click('button.lk-b'); await wait(1500);
    const cs = sent('/rest/v1/rpc/create_store')[0];
    ok('店舗作成の関数に、名前・業種・従業員数が渡る',
      cs && cs.body.p_name === 'グループホームさくら' && cs.body.p_industry.startsWith('介護施設') && cs.body.p_company_size === 'large', JSON.stringify(cs && cs.body));
    const st = sent('/rest/v1/shift_types', 'POST')[0].body, sf = sent('/rest/v1/staff', 'POST')[0].body, wg = sent('/rest/v1/staff_private', 'POST')[0].body;
    const ids = new Set(st.map(x => x.id));
    ok('シフト区分が、業種テンプレートの5つ（早出・日勤・遅出・夜勤・休み）で入る', st.length === 5 && st.map(x => x.name).join() === '早出,日勤,遅出,夜勤,休み');
    ok('夜勤には「明け休み」、休みには「休みの区分」の印が付く', st[3].next_day_off === true && st[4].is_off === true);
    ok('サンプルのスタッフ11人と、その時給が入る', sf.length === 11 && wg.length === 11 && wg.every(w => sf.some(s => s.id === w.staff_id) && w.wage > 0));
    ok('固定曜日の区分は、入れたシフト区分を指している',
      sf.every(s => Object.values(s.fixed_days).every(v => ids.has(v))) && sf.some(s => Object.keys(s.fixed_days).length > 0));
    ok('すべての行が、作ったお店のIDを持つ', [...st, ...sf, ...wg].every(r => r.store_id === db.store.id));
    const ps = sent('/rest/v1/store_settings', 'PATCH')[0];
    ok('必要人数と巡回パターンが、お店の設定に入る', ps && ps.body.need.length === 7 && ps.body.patterns.length === 2 && /store_id=eq\.2222/.test(ps.search));
    ok('作ったあとは管理画面に入る', !!(await page.$('#tabs .tab')) && (await page.textContent('#hd')).includes('グループホームさくら'));
    ok('管理画面にも同じテンプレートが入る（早出・夜勤）', (await text()).includes('早出') && (await text()).includes('夜勤'));
    await page.evaluate(() => { document.getElementById('toast').hidden = true; });
    await shot('06-admin');

    console.log('\n== もう一度開く・ログアウト ==');
    await page.click('text=ロックしてスタッフ画面へ'); await wait();
    await page.click('text=管理者メニュー'); await wait(500);
    ok('ログイン中なら、管理者メニューですぐ管理画面に入る', !!(await page.$('#tabs .tab')));
    await page.reload(); await wait(1500);
    await page.click('text=管理者メニュー'); await wait(800);
    ok('ページを開き直しても、ログインは続いている', !!(await page.$('#tabs .tab')));
    await page.click('#hd button:has-text("ログアウト")'); await wait(800);
    ok('ログアウトするとスタッフ画面に戻る', !(await page.$('#tabs .tab')) && sent('/auth/v1/logout').length === 1);
    await page.click('text=管理者メニュー'); await wait();
    ok('ログアウト後は、またログイン画面になる', (await text()).includes('店長のログイン'));

    console.log('\n== パスワードを忘れたとき ==');
    await page.click('text=パスワードを忘れたとき'); await wait();
    await page.fill('#f_ae', 'tencho@example.com');
    await page.click('button.lk-b'); await wait(800);
    const rc = sent('/auth/v1/recover')[0];
    ok('再設定のメールを頼む通信に、ロボット対策のトークンが入る', rc && rc.body.email === 'tencho@example.com' && rc.body.gotrue_meta_security.captcha_token === 'test-captcha-token');
    ok('「再設定のメールを送りました」の画面になる', (await text()).includes('パスワード再設定のメールを送りました'));
    await shot('07-reset-sent');

    console.log('\n== スマホの幅 ==');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('text=ログイン画面に戻る'); await wait();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok('スマホの幅でも横にはみ出さない', sw <= 390, String(sw));
    await shot('08-login-phone');

    ok('画面のエラーは0件', errors.length === 0, errors.join(' / '));
    console.log(`\nすべてのテストに合格しました（${passed}項目）`);
  } catch (e) {
    if (!process.exitCode) { console.log('FAIL: ' + e.message); process.exitCode = 1; }
  } finally {
    await browser.close(); server.kill();
  }
})();
