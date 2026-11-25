// アプリの templateRows（業種テンプレート → データベースの行）を、8業種ぶん JSON に書き出す。
// tests/run-template-test.sh から呼ばれる。dist-test/ のビルドを使う（npm run test:account で作られる）。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const root = path.resolve(__dirname, '..'), out = process.argv[2];
(async () => {
  const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-test', '--port', '4175', '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 2500));
  const b = await chromium.launch(); const p = await b.newPage();
  await p.route(/supabase\.co|fonts\.(googleapis|gstatic)/, r => r.abort());
  await p.goto('http://localhost:4175/'); await p.waitForTimeout(800);
  const rows = await p.evaluate(() => Object.keys(TPL).map(ind => ({ industry: ind, ...templateRows('00000000-0000-4000-8000-0000000000ff', ind, true) })));
  fs.writeFileSync(out, JSON.stringify(rows));
  console.log(rows.length + ' 業種のテンプレートを書き出しました');
  await b.close(); server.kill();
})();
