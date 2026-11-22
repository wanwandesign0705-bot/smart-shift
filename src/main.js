// 入口。各ファイルの関数・定数を window に登録してから起動する。
// v2.3 は1つの <script> にすべてが入っていたため、画面の onclick="go(1)" などは名前だけで関数を呼んでいた。
// その書き方を変えずに移すため、ここで全部を window に載せている（作業4以降で順に import へ置き換える）。
import './styles.css';
import * as constants from './config/constants.js';
import * as law from './config/law.js';
import * as updates from './config/updates.js';
import * as legal from './config/legal.js';
import * as utils from './utils.js';
import * as data from './data.js';
import * as state from './state.js';
import * as plan from './plan.js';
import * as period from './period.js';
import * as calc from './calc.js';
import * as exporter from './export.js';
import * as reservations from './views/reservations.js';
import * as grid from './views/grid.js';
import * as adminShift from './views/admin-shift.js';
import * as adminRequests from './views/admin-requests.js';
import * as adminLeave from './views/admin-leave.js';
import * as adminAnalysis from './views/admin-analysis.js';
import * as adminNotices from './views/admin-notices.js';
import * as adminSettings from './views/admin-settings.js';
import * as adminPlan from './views/admin-plan.js';
import * as staff from './views/staff.js';
import * as infoPages from './views/info-pages.js';
import * as shell from './views/shell.js';

const modules = { constants, law, updates, legal, utils, data, state, plan, period, calc, exporter, reservations, grid,
  adminShift, adminRequests, adminLeave, adminAnalysis, adminNotices, adminSettings, adminPlan, staff, infoPages, shell };

const seen = {};
for (const [file, mod] of Object.entries(modules)) {
  for (const [name, value] of Object.entries(mod)) {
    if (seen[name]) throw new Error(`「${name}」が ${seen[name]} と ${file} の両方にあります`);
    // id 付きの要素（<div id="toast"> など）は window.toast として見えるが、v2.3 と同じく関数で上書きしてよい
    if (name in window && !(window[name] instanceof Element)) throw new Error(`「${name}」はブラウザの既存の名前と重なります（${file}）`);
    seen[name] = file;
    window[name] = value;
  }
}

/* ===================== 起動 ===================== */
// 読み込みは Supabase に替えると待ち時間が出るので、今から「読み終わってから描く」形にしておく
initState().then(() => {
  if (!Object.keys(S.grid).length) { gen(); msg = ''; }
  render();
  if (returning && isNewUpd()) whatsNew();
});
