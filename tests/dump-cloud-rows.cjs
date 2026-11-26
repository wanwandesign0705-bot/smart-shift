// アプリの storeToRows / diffRows が作る「送る操作」を JSON に書き出す（tests/run-cloud-rows-test.sh から呼ぶ）。
// 1回目：お店を開いた直後に全部を送る操作。2回目：セルの変更・スタッフの削除・区分の追加をしたあとの差分。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), out = process.argv[2];
(async () => {
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4178', '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/supabase\.co|fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('http://localhost:4178/'); await p.waitForTimeout(800);
  const result = await p.evaluate(() => {
    const SID = '00000000-0000-4000-8000-0000000000ff';
    Object.assign(S, build(Object.keys(TPL)[0])); S.grid = {}; S.wish = {}; S.memo = {};
    normalizeIds(S);
    curStart = '2026-11-01'; norm(); gen();
    const a = S.staff[2].id;
    S.grid[a]['2026-11-05'] = 'PL'; S.grid[a]['2026-11-06'] = 'PLH';
    (S.wish[a] ??= {})['2026-11-07'] = true; S.memo[a + '_2026-11-08'] = '10時出勤';
    S.pubUntil = '2026-11-15';
    const r1 = storeToRows(S, SID), first = diffRows(null, r1);
    S.grid[S.staff[0].id]['2026-11-03'] = S.shifts[3].id;           // セルの変更
    const gone = S.staff[7].id; S.staff.splice(7, 1);              // スタッフの削除
    S.shifts.push({ id: 's' + Date.now(), name: '新区分', time: '09:00-18:00', color: '#FEE2E2', min: 0 });
    normalizeIds(S);
    const r2 = storeToRows(S, SID), second = diffRows(r1, r2);
    return { first, second, gone, counts: { cells1: r1.cells.length, cells2: r2.cells.length, staff2: r2.staff.length, types2: r2.shiftTypes.length } };
  });
  fs.writeFileSync(out, JSON.stringify(result));
  console.log('送る操作：1回目 ' + result.first.length + ' 件、2回目 ' + result.second.length + ' 件を書き出しました');
  await b.close(); server.kill();
})();
