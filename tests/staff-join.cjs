// 作業5のテスト：店長が招待リンクを発行し、スタッフが別の端末で参加できるか。
// 店長の端末とスタッフの端末を、別々のブラウザ（別の保存場所）として同時に動かす。
// 使い方：npm run test:staff
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { createFake } = require('./fake-supabase.cjs');

const root = path.resolve(__dirname, '..');
const shotDir = path.join(root, 'compare-output', 'staff');
fs.mkdirSync(shotDir, { recursive: true });
const PORT = 4179;
let passed = 0;
function ok(name, cond, detail = '') {
  if (!cond) { console.log('FAIL: ' + name + (detail ? ' — ' + String(detail).slice(0, 400) : '')); process.exitCode = 1; throw new Error(name); }
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

  const owner = await device('店長');
  try {
    console.log('\n== 店長：お店を作って、今月を公開する ==');
    await owner.goto(`http://localhost:${PORT}/`); await wait(owner, 800);
    await owner.click('text=管理者メニュー'); await wait(owner, 500);
    await owner.fill('#f_ae', 'tencho@example.com'); await owner.fill('#f_ap', fake.password); await wait(owner, 100);
    await owner.click('button.lk-b'); await wait(owner, 1200);
    await owner.check('#f_ag1'); await owner.check('#f_ag2'); await owner.click('button.lk-b'); await wait(owner, 1200);
    await owner.fill('#f_sn', '居酒屋テスト'); await owner.click('button.lk-b'); await wait(owner, 1500);
    await saved(owner);
    await owner.click('button:has-text("スタッフに公開")'); await saved(owner);
    ok('今月を公開した', db.shift_publications.length === 1);

    console.log('\n== 店長：招待リンクを発行する ==');
    await owner.evaluate(() => go(5)); await wait(owner, 1200);
    ok('設定に「スタッフの参加」が出て、全員が未招待', (await text(owner)).includes('スタッフの参加（招待リンク）') && (await owner.$$eval('#invite-card .chip', e => e.filter(x => x.textContent === '未招待').length)) === 8);
    const yamada = await owner.evaluate(() => S.staff.find(s => s.name === '山田 花子').id);
    await owner.evaluate(id => issueInvite(id), yamada); await wait(owner, 1200);
    const url = await owner.inputValue('#inv-url');
    ok('招待リンクが出る（トークンは「#」のあと）', /^http:\/\/localhost:\d+\/#invite=[0-9a-zA-Z]{20,}$/.test(url), url);
    ok('QR コードも出る', await owner.$eval('#md img', i => i.src.startsWith('data:image/png') && i.naturalWidth > 100));
    await owner.screenshot({ path: path.join(shotDir, '01-invite-modal.png') });
    await owner.click('#md button:has-text("閉じる")'); await wait(owner, 1200);
    ok('発行した人は「招待中」になる', await owner.evaluate(id => (document.querySelector('#invite-card').innerText.split('\n').join(' ')).includes('招待中'), yamada));

    console.log('\n== スタッフ：自分のスマホでリンクを開く ==');
    const staff = await device('スタッフ', { width: 390, height: 844 });
    await staff.goto(url); await wait(staff, 1200);
    ok('「Smart Shift に参加する」の画面になる', (await text(staff)).includes('Smart Shift に参加する'));
    await staff.screenshot({ path: path.join(shotDir, '02-join.png') });
    await staff.click('button.lk-b'); await wait(staff, 2500);
    ok('参加すると、店の名前つきで「スタッフとして参加中」と出る', (await staff.textContent('#hd')).includes('居酒屋テスト・スタッフとして参加中'));
    ok('URL からトークンが消える', !(await staff.evaluate(() => location.hash)).includes('invite'));
    ok('名簿の山田さんに、この端末が結びつく', db.staff.find(s => s.id === yamada).user_id === Object.values(fake.users).find(u => u.is_anonymous).id);
    ok('名前を選ぶ欄は出ない（自分に決まっている）', !(await staff.$('#f_me')) && (await staff.evaluate(() => me)) === yamada);
    const my = await text(staff);
    ok('マイシフトに、自分のシフトと給与見込が出る（時給 ¥1,100）', my.includes('給与見込') && my.includes('時給 ¥1,100') && my.includes('出勤日数'));
    ok('マイシフトに、有給の残りも出る', my.includes('有給の残り'));
    await staff.screenshot({ path: path.join(shotDir, '03-my-shift.png'), fullPage: true });
    ok('ほかの人の時給は、この端末には来ない', await staff.evaluate(id => S.staff.filter(s => s.id !== id).every(s => s.wage === 0), yamada));
    // このお店にしかないスタッフの ID で探す（この端末のサンプルデータにも同じ名前・時給の人がいるため）
    ok('この端末の保存には、お店のデータを書かない', await staff.evaluate(ids => Object.keys(localStorage).every(k => k.startsWith('sb-') || !ids.some(id => (localStorage.getItem(k) || '').includes(id))), db.staff.map(s => s.id)));
    await staff.click('button[aria-label="次の期間"]'); await wait(staff);
    ok('公開していない来月は「まだ公開されていません」', (await text(staff)).includes('まだ公開されていません'));
    await staff.click('button:has-text("申請")'); await wait(staff);
    ok('申請は、作業6まで「まもなく使えるようになります」と知らせる', (await text(staff)).includes('まもなく'));
    await staff.reload(); await wait(staff, 2500);
    ok('開き直しても、スタッフとして参加したまま', (await staff.textContent('#hd')).includes('スタッフとして参加中') && (await staff.evaluate(() => me)) === yamada);

    console.log('\n== 同じリンクは2回使えない ==');
    const other = await device('別の人');
    await other.goto(url); await wait(other, 1000);
    await other.click('button.lk-b'); await wait(other, 2000);
    ok('使ったリンクを別の端末で開くと「使えません」と出る', (await text(other)).includes('この招待リンクは使えません'));

    console.log('\n== 店長：参加済みになり、再発行と解除ができる ==');
    await owner.click('button:has-text("最新の状態にする")'); await wait(owner, 1200);
    ok('山田さんが「参加済み」になる', (await owner.$$eval('#invite-card .chip', e => e.filter(x => x.textContent === '参加済み').length)) === 1);
    await owner.evaluate(id => issueInvite(id), yamada); await wait(owner, 1200);
    const url2 = await owner.inputValue('#inv-url');
    await owner.click('#md button:has-text("閉じる")'); await wait(owner);
    const phone2 = await device('機種変更したスマホ', { width: 390, height: 844 });
    await phone2.goto(url2); await wait(phone2, 1000);
    await phone2.click('button.lk-b'); await wait(phone2, 2500);
    ok('再発行したリンクで、新しいスマホが参加できる', (await phone2.textContent('#hd')).includes('スタッフとして参加中'));
    await staff.reload(); await wait(staff, 2500);
    ok('前のスマホは「参加は解除されています」になり、シフトは見えない', (await text(staff)).includes('この端末の参加は解除されています') && !(await text(staff)).includes('給与見込'));
    await owner.click('button:has-text("最新の状態にする")'); await wait(owner, 1200);
    await owner.evaluate(id => askUnlink(id), yamada); await wait(owner);
    await owner.click('#md button:has-text("解除する")'); await wait(owner, 1200);
    ok('参加を解除すると、名簿の結びつきが外れる', db.staff.find(s => s.id === yamada).user_id === null);
    await phone2.reload(); await wait(phone2, 2500);
    ok('解除されたスマホは、シフトが見えなくなる', (await text(phone2)).includes('この端末の参加は解除されています'));

    console.log('\n== 店長の端末で招待リンクを開いたとき ==');
    await owner.evaluate(id => issueInvite(id), yamada); await wait(owner, 1200);
    const url3 = await owner.inputValue('#inv-url');
    await owner.click('#md button:has-text("閉じる")'); await wait(owner);
    await owner.goto(url3); await wait(owner, 2500);
    ok('「店長としてログインしています」と出て、参加させない', (await text(owner)).includes('店長としてログインしています') && db.staff.find(s => s.id === yamada).user_id === null);

    ok('どの端末でも画面のエラーは0件', errors.length === 0, errors.join(' / '));
    console.log(`\nすべてのテストに合格しました（${passed}項目）`);
  } catch (e) {
    if (!process.exitCode) { console.log('FAIL: ' + e.message); process.exitCode = 1; }
  } finally { await browser.close(); server.kill(); }
})();
