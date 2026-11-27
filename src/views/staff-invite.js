// このファイルの関数・定数は main.js で window に登録され、画面の onclick と他のファイルから名前だけで呼べます。
/* ===================== スタッフの参加（作業5） =====================
   店長：設定の名簿の下に「スタッフの参加」。招待リンクの発行・再発行（QR コード付き）と、参加の解除。
   スタッフ：招待リンクを開くと「参加する」の画面。参加したあとは、その端末でスタッフ画面が見られる。
*/

/* ---------- 店長：参加の状態 ---------- */
let statusLoading = false;
async function loadStatus() {
  if (statusLoading) return;
  statusLoading = true;
  try { inviteStatus = await loadInviteStatus(acct.store.id); }
  catch (e) { inviteStatus = { error: accountError(e) }; }
  statusLoading = false; render();
}
export function refreshInviteStatus() { inviteStatus = null; render(); }

const STATE = { joined: ['参加済み', 'ok'], invited: ['招待中', 'warn'], none: ['未招待', ''] };
export function inviteCard() {
  if (!cloudStoreOpen()) return '';
  if (!inviteStatus) { loadStatus(); }
  const st = inviteStatus || {};
  const rows = S.staff.map(s => {
    const x = st[s.id] || { state: UUIDish(s.id) ? 'none' : 'new' };
    if (x.state === 'new') return `<tr><td>${esc(s.name)}</td><td colspan="2" class="small muted">保存が終わると発行できます</td></tr>`;
    const [label, cls] = STATE[x.state];
    return `<tr><td><b>${esc(s.name)}</b><div class="xs muted">${esc(s.role)}</div></td>
      <td><span class="chip ${cls}">${label}</span>${x.state === 'invited' ? `<div class="xs muted">期限 ${fmtY(x.expires.slice(0, 10))}</div>` : ''}</td>
      <td><div class="row" style="justify-content:flex-end">
        <button class="b3" onclick="issueInvite('${s.id}')">${x.state === 'none' ? '招待リンクを発行' : '招待リンクを再発行'}</button>
        ${x.state === 'joined' ? `<button class="b3 danger" onclick="askUnlink('${s.id}')">参加を解除</button>` : ''}</div></td></tr>`;
  }).join('');
  return `<div class="card" id="invite-card"><div class="row between"><h2 style="margin:0">スタッフの参加（招待リンク）</h2><button class="b3" onclick="refreshInviteStatus()">最新の状態にする</button></div>
  <p class="small muted" style="margin:6px 0 10px">スタッフごとに招待リンクを発行し、LINE などで本人に送ってください。リンクを開くと、その端末で自分のシフト・給与見込・有給の残りが見られます。メールアドレスやパスワードはいりません。リンクは1回だけ使え、7日で使えなくなります。機種変更などで見られなくなったら、再発行してください（前の端末は見られなくなります）。</p>
  ${inviteStatus && inviteStatus.error ? `<p class="small" style="color:var(--bad)">${esc(inviteStatus.error)}</p>` : ''}
  <div class="tw"><table class="t"><tr><th>スタッフ</th><th>状態</th><th></th></tr>${rows}</table></div></div>`;
}
const UUIDish = id => /^[0-9a-f-]{36}$/.test(id);

/* ---------- 店長：発行・解除 ---------- */
export async function issueInvite(staffId) {
  if (cloudUnsaved()) { toast('保存が終わってから、もう一度押してください'); return; }
  const s = S.staff.find(x => x.id === staffId);
  let url;
  try { url = await createInvite(staffId); }
  catch (e) { toast('招待リンクを発行できませんでした：' + accountError(e)); return; }
  inviteStatus = null;
  let qr = '';
  try { const QR = (await import('qrcode')).default; qr = await QR.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }); } catch (e) { qr = ''; }
  $('md').innerHTML = `<div class="mdl" onclick="if(event.target===this)closeInvite()"><div class="mdc fi" role="dialog" aria-label="招待リンク">
    <h2>${esc(s ? s.name : '')}さんの招待リンク</h2>
    <p class="small muted" style="margin-bottom:10px">このリンクを本人だけに送ってください。1回だけ使え、7日で使えなくなります。この画面を閉じると、同じリンクはもう表示できません（必要なら再発行してください）。</p>
    ${qr ? `<div style="text-align:center;margin:8px 0"><img src="${qr}" width="220" height="220" alt="招待リンクのQRコード" style="border-radius:8px;background:#fff"><div class="xs muted">本人のスマホのカメラで読み取れます</div></div>` : ''}
    <input id="inv-url" readonly value="${esc(url)}" style="width:100%;font-size:12px" onclick="this.select()">
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="b2" onclick="closeInvite()">閉じる</button><button class="b" onclick="copyInvite()">リンクをコピー</button></div></div></div>`;
  render();
}
export function closeInvite() { $('md').innerHTML = ''; render(); }
export async function copyInvite() {
  const el = $('inv-url');
  try { await navigator.clipboard.writeText(el.value); toast('コピーしました。LINE などに貼って本人に送ってください'); }
  catch (e) { el.select(); toast('選んだ状態にしました。コピーして送ってください'); }
}
export function askUnlink(staffId) {
  const s = S.staff.find(x => x.id === staffId);
  $('md').innerHTML = `<div class="mdl"><div class="mdc fi"><h2>${esc(s.name)}さんの参加を解除しますか？</h2>
    <p class="small muted" style="margin-bottom:16px">今の端末から、シフトが見られなくなります。また参加してもらうときは、招待リンクを再発行してください。</p>
    <div class="row" style="justify-content:flex-end"><button class="b2" onclick="closeInvite()">キャンセル</button><button class="b" onclick="doUnlink('${staffId}')">解除する</button></div></div></div>`;
}
export async function doUnlink(staffId) {
  try { await unlinkStaff(acct.store.id, staffId); toast('参加を解除しました'); }
  catch (e) { toast('解除できませんでした：' + accountError(e)); }
  $('md').innerHTML = ''; inviteStatus = null; render();
}

/* ---------- スタッフ：招待リンクを開いたとき ---------- */
export function joinView() {
  const owner = acct.user && !acct.user.is_anonymous;
  if (owner) {
    return `<div class="card" style="max-width:560px;margin:0 auto"><h2>店長としてログインしています</h2>
      <p class="small" style="margin-bottom:14px">このリンクは、スタッフの招待用です。スタッフ本人のスマホで開いてもらってください。店長の端末で参加すると、店長のアカウントがスタッフに結びついてしまうため、ここでは参加できません。</p>
      <button class="b" onclick="leaveJoin()">閉じる</button></div>`;
  }
  return `<div class="card au" style="max-width:480px;margin:0 auto"><h2 style="font-size:18px">Smart Shift に参加する</h2>
    <p class="small" style="margin-bottom:12px;line-height:1.8">お店から届いた招待リンクです。参加すると、この端末で<b>公開されたシフト・自分の給与見込・有給の残り</b>が見られます。メールアドレスやパスワードはいりません。</p>
    <p class="xs muted" style="margin-bottom:10px">ほかの人の時給やお店の予算は見えません。機種変更やブラウザのデータを消したときは、店長に招待リンクを再発行してもらってください。</p>
    <form class="au-f" onsubmit="event.preventDefault()">${acct.user ? '' : `<div id="ts" class="au-ts"></div>`}
    <button class="lk-b" onclick="doJoin()" ${authBusy ? 'disabled' : ''}>${authBusy ? '参加しています…' : '参加する'}</button>
    <div class="lk-m" role="alert">${esc(authMsg || '')}</div></form></div>`;
}
export function leaveJoin() { clearInviteFromUrl(); inviteToken = null; page = null; authMsg = ''; render(); }
export async function doJoin() {
  if (authBusy) return;
  const anon = acct.user && acct.user.is_anonymous;
  if (!anon) {
    if (!TURNSTILE_SITE_KEY) { authMsg = 'ロボット対策の設定（Site Key）がまだです。お店に連絡してください。'; render(); return; }
    if (!captchaToken) { authMsg = '「ロボットではありません」の確認が終わってから、もう一度押してください。'; render(); return; }
  }
  const token = captchaToken;
  authBusy = true; authMsg = ''; render();
  try {
    await joinWithInvite(inviteToken, token);
    clearInviteFromUrl(); inviteToken = null; page = null;
    await refreshAccount();
    toast(staffCtx ? `「${staffCtx.storeName}」に参加しました` : '参加しました');
  } catch (e) {
    authMsg = e.message === 'owner_session' ? '店長としてログインしているため、参加できません。' : accountError(e);
  } finally { authBusy = false; render(); }
}

/** スタッフとして参加している端末なら、お店のデータを読み込む */
export async function loadStaffIntoApp() {
  try {
    const r = await openStaffStore();
    // 匿名ログインはしているが、名簿に結びついていない（参加を解除された・再発行で別の端末に移った）
    if (!r) { staffCtx = { unlinked: true }; return; }
    S = r.S; me = r.staffId; staffCtx = { storeName: r.storeName }; mode = 'db'; norm();
  } catch (e) { staffCtx = { error: accountError(e) }; }
}
