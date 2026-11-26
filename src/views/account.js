// このファイルの関数・定数は main.js で window に登録され、画面の onclick と他のファイルから名前だけで呼べます。
/* ===================== 店長のアカウント（作業3） =====================
   Supabase が使えるとき、「管理者メニュー」はパスワードのロックではなく、この画面になる。
   流れ：ログイン or 新規登録 → （メールの確認）→ 規約への同意 → お店の作成 → 管理画面
   Supabase とのやり取りはデータ層（data.js）の関数だけを使う。
*/

const INDUSTRIES = () => Object.keys(TPL);

/** ログインと同意とお店がそろっていれば、管理画面に入れる */
export const acctReady = () => !!(acct && acct.user && !acct.user.is_anonymous && acct.consented && acct.store);

/** 「管理者メニュー」を押したとき */
export function openAdmin() {
  showLock = true;
  if (cloudEnabled && acctReady()) enterAdmin();
  render();
}

export function enterAdmin() { adminOK = true; showLock = false; authStep = 'login'; authMsg = ''; }

/** ログイン状態を読み直す。管理者メニューを開いている途中なら、そろった時点で管理画面に入る */
export async function refreshAccount() {
  try { acct = { ...(await loadAccount()), loading: false }; }
  catch (e) { acct = { user: null, consented: false, store: null, loading: false, error: accountError(e) }; }
  if (acctReady() && !cloudStoreOpen()) await loadCloudStoreIntoApp();
  if (showLock && acctReady()) enterAdmin();
  render();
}

/** お店のデータを Supabase から読み込み、画面に出す（作業4） */
export async function loadCloudStoreIntoApp() {
  storeLoadError = '';
  try { S = await openCloudStore(acct.store.id); mode = 'db'; cfgReady = true; sel = null; norm(); }
  catch (e) { storeLoadError = accountError(e); }
}
export async function retryStoreLoad() { await loadCloudStoreIntoApp(); render(); }

export async function logout() {
  if (cloudUnsaved() && !confirmLogout) {
    confirmLogout = true; toast('まだ送っていない変更があります。もう一度ログアウトを押すと、送らずにログアウトします'); return;
  }
  confirmLogout = false;
  await signOut();
  closeCloudStore();
  // この端末に、お店のデータ（時給など）を残さない。画面はこの端末の保存に戻す
  const local = loadStore(); S = local ? migrate(local) : def(); mode = 'local';
  acct = { user: null, consented: false, store: null, loading: false };
  adminOK = false; showLock = false; authStep = 'login'; sel = null;
  toast('ログアウトしました'); render(true);
}

function setStep(step, message = '') { authStep = step; authMsg = message; render(true); }
export function authGo(step) { setStep(step); }

/* ---------- ロボット対策（Cloudflare Turnstile） ---------- */
let turnstileLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoading) {
    turnstileLoading = new Promise((ok, ng) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.onload = () => ok(window.turnstile); s.onerror = () => { turnstileLoading = null; ng(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}
/** 画面を描いたあとに呼ぶ。確認の枠（#ts）があれば、Turnstile を入れる */
export async function mountTurnstile() {
  const box = $('ts');
  if (!box || box.dataset.mounted) return;
  box.dataset.mounted = '1';
  captchaToken = null;
  if (!TURNSTILE_SITE_KEY) return;
  try {
    const ts = await loadTurnstile();
    if (!document.body.contains(box)) return;
    ts.render(box, {
      sitekey: TURNSTILE_SITE_KEY, language: 'ja',
      callback: t => { captchaToken = t; },
      'expired-callback': () => { captchaToken = null; },
      'error-callback': () => { captchaToken = null; },
    });
  } catch (e) {
    box.innerHTML = '<p class="small" style="color:var(--bad)">ロボット対策の読み込みに失敗しました。ページを再読み込みしてください。</p>';
  }
}
function needCaptcha() {
  if (!TURNSTILE_SITE_KEY) { authMsg = 'ロボット対策の設定（Site Key）がまだです。運営者に連絡してください。'; render(); return true; }
  if (!captchaToken) { authMsg = '「ロボットではありません」の確認が終わってから、もう一度押してください。'; render(); return true; }
  return false;
}

/* ---------- 入力の確かめ ---------- */
const val = id => (($(id) || {}).value || '').trim();
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
function checkPassword(p) {
  if (p.length < 8) return 'パスワードは8文字以上にしてください。';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'パスワードには英字と数字の両方を入れてください。';
  return '';
}

/* ---------- ボタンを押したとき ---------- */
// 送信中は画面を描き直すので、ロボット対策の確認結果（トークン）は押した時点で取っておいてから渡すこと
async function busy(fn) {
  if (authBusy) return;
  authBusy = true; render();
  try { await fn(); }
  catch (e) { authMsg = accountError(e); }
  finally { authBusy = false; render(); }
}

export function doLogin() {
  const email = val('f_ae'), pw = ($('f_ap') || {}).value || '';
  if (!validEmail(email)) { authMsg = 'メールアドレスを正しく入れてください。'; render(); return; }
  if (!pw) { authMsg = 'パスワードを入れてください。'; render(); return; }
  if (needCaptcha()) return;
  const token = captchaToken;
  busy(async () => { await signIn(email, pw, token); authMsg = ''; await refreshAccount(); });
}

export function doSignUp() {
  const email = val('f_ae'), pw = ($('f_ap') || {}).value || '', pw2 = ($('f_ap2') || {}).value || '';
  if (!validEmail(email)) { authMsg = 'メールアドレスを正しく入れてください。'; render(); return; }
  const bad = checkPassword(pw); if (bad) { authMsg = bad; render(); return; }
  if (pw !== pw2) { authMsg = '確認用のパスワードが一致しません。'; render(); return; }
  if (needCaptcha()) return;
  const token = captchaToken;
  busy(async () => {
    const r = await signUp(email, pw, token);
    authEmail = email;
    if (r.needsConfirm) setStep('sent'); else { authStep = 'login'; authMsg = ''; await refreshAccount(); }
  });
}

export function doForgot() {
  const email = val('f_ae');
  if (!validEmail(email)) { authMsg = 'メールアドレスを正しく入れてください。'; render(); return; }
  if (needCaptcha()) return;
  const token = captchaToken;
  busy(async () => { await requestPasswordReset(email, token); authEmail = email; setStep('forgot-sent'); });
}

export function doNewPassword() {
  const pw = ($('f_ap') || {}).value || '', pw2 = ($('f_ap2') || {}).value || '';
  const bad = checkPassword(pw); if (bad) { authMsg = bad; render(); return; }
  if (pw !== pw2) { authMsg = '確認用のパスワードが一致しません。'; render(); return; }
  busy(async () => { await setNewPassword(pw); authStep = 'login'; authMsg = ''; toast('パスワードを変更しました'); await refreshAccount(); });
}

export function doConsent() {
  if (!(($('f_ag1') || {}).checked && ($('f_ag2') || {}).checked)) { authMsg = '利用規約とプライバシーポリシーの両方にチェックしてください。'; render(); return; }
  busy(async () => { await saveConsents(acct.user.id); authMsg = ''; await refreshAccount(); });
}

export function doCreateStore() {
  const name = val('f_sn'), industry = ($('f_si') || {}).value, size = ($('f_ss') || {}).value || '', sample = !!($('f_sx') || {}).checked;
  if (!name) { authMsg = 'お店の名前を入れてください。'; render(); return; }
  if (!INDUSTRIES().includes(industry)) { authMsg = '業種を選んでください。'; render(); return; }
  busy(async () => {
    let store;
    try { store = await createStoreWithTemplate({ name, industry, companySize: size, withSample: sample }); }
    catch (e) {
      // お店はできたが、テンプレートの一部が入らなかった場合は、そのまま管理画面に進める
      if (!e.storeCreated) throw e;
      toast('お店は作れましたが、テンプレートの一部を入れられませんでした。設定画面で確認してください');
    }
    // 作ったお店を Supabase から読み込み、今月のシフトを自動作成して保存する
    authMsg = '';
    await refreshAccount();
    if (cloudStoreOpen()) { gen(); msg = ''; }
    if (store) toast(`「${name}」を作りました。2ヶ月の無料トライアルが始まりました`);
  });
}

/* ---------- 画面 ---------- */
const field = (id, label, type = 'text', attrs = '') =>
  `<label class="au-l" for="${id}">${label}</label><input id="${id}" class="au-i" type="${type}" ${attrs}>`;
const link = (text, step) => `<button class="lk-l" onclick="authGo('${step}')">${text}</button>`;
const captchaBox = () => `<div id="ts" class="au-ts"></div>${TURNSTILE_SITE_KEY ? '' : '<p class="xs" style="color:var(--bad);margin:0">ロボット対策の Site Key が未設定です（.env の VITE_TURNSTILE_SITE_KEY）</p>'}`;
const submit = (text, fn) => `<button class="lk-b" onclick="${fn}()" ${authBusy ? 'disabled' : ''}>${authBusy ? '送信中…' : text}</button>`;
const message = () => `<div class="lk-m" role="alert">${esc(authMsg || '')}</div>`;
const back = () => `<button class="lk-l" onclick="showLock=false;authStep='login';authMsg='';render()">スタッフ画面に戻る</button>`;

function frame(title, sub, body) {
  return `<div class="lk"><div class="lk-in au"><div class="lk-mark">${icon('lock')}</div><div class="lk-eye">ADMINISTRATOR</div><div class="lk-t">Smart Shift</div>
  <div class="lk-s" style="margin-bottom:24px"><b style="color:var(--fg)">${title}</b>${sub ? `<br><span class="small">${sub}</span>` : ''}</div>
  <form class="au-f" onsubmit="event.preventDefault()">${body}</form></div></div>`;
}

export function accountScreen() {
  const step = authStep;
  if (step === 'sent' || step === 'forgot-sent') {
    const forgot = step === 'forgot-sent';
    return frame(forgot ? 'パスワード再設定のメールを送りました' : '確認メールを送りました', '',
      `<p class="small" style="text-align:left;line-height:1.8">${esc(authEmail || '')} に、${forgot ? 'パスワードを決め直すための' : '登録を確かめるための'}リンクを送りました。<br>
      メールを開き、リンクを押してください。この画面に戻ってきて、続きから進められます。<br>
      <span class="muted">メールが届かないときは、迷惑メールのフォルダも確かめてください。</span></p>
      ${link('ログイン画面に戻る', 'login')}${back()}`);
  }
  if (step === 'newpass') {
    return frame('新しいパスワードを決める', '8文字以上で、英字と数字をまぜてください',
      `${field('f_ap', '新しいパスワード', 'password', 'autocomplete="new-password"')}${field('f_ap2', '新しいパスワード（確認のため、もう一度）', 'password', 'autocomplete="new-password"')}
      ${submit('パスワードを変更する', 'doNewPassword')}${message()}`);
  }
  if (step === 'forgot') {
    return frame('パスワードを忘れたとき', '登録したメールアドレスに、決め直すためのリンクを送ります',
      `${field('f_ae', 'メールアドレス', 'email', 'autocomplete="email"')}${captchaBox()}${submit('再設定のメールを送る', 'doForgot')}${message()}
      ${link('ログイン画面に戻る', 'login')}`);
  }
  if (step === 'signup') {
    return frame('新しく登録する', '店長（管理者）のアカウントを作ります。最初の2ヶ月は無料です',
      `${field('f_ae', 'メールアドレス', 'email', 'autocomplete="email"')}${field('f_ap', 'パスワード（8文字以上、英字と数字をまぜる）', 'password', 'autocomplete="new-password"')}
      ${field('f_ap2', 'パスワード（確認のため、もう一度）', 'password', 'autocomplete="new-password"')}${captchaBox()}
      ${submit('登録する', 'doSignUp')}${message()}${link('すでに登録している方はこちら（ログイン）', 'login')}${back()}`);
  }
  if (acct.loading) return frame('読み込んでいます…', '', back());
  if (!acct.user || acct.user.is_anonymous) {
    return frame('店長のログイン', '',
      `${acct.error ? `<p class="small" style="color:var(--bad)">${esc(acct.error)}</p>` : ''}
      ${field('f_ae', 'メールアドレス', 'email', 'autocomplete="email"')}${field('f_ap', 'パスワード', 'password', 'autocomplete="current-password" onkeydown="if(event.key===\'Enter\')doLogin()"')}
      ${captchaBox()}${submit('ログインする', 'doLogin')}${message()}
      ${link('はじめての方：新しく登録する', 'signup')}${link('パスワードを忘れたとき', 'forgot')}${back()}`);
  }
  if (!acct.consented) {
    return frame('ご利用を始める前に', '利用規約とプライバシーポリシーをお読みのうえ、同意してください',
      `<label class="row au-c"><input type="checkbox" id="f_ag1"><span><button type="button" class="au-a" onclick="openLegal('terms')">利用規約</button>に同意します</span></label>
      <label class="row au-c"><input type="checkbox" id="f_ag2"><span><button type="button" class="au-a" onclick="openLegal('privacy')">プライバシーポリシー</button>に同意します</span></label>
      ${submit('同意して進む', 'doConsent')}${message()}
      <button class="lk-l" onclick="logout()">ログアウト</button>`);
  }
  if (!acct.store) {
    return frame('お店を作る', 'あとから設定で変えられます',
      `${field('f_sn', 'お店の名前', 'text', 'placeholder="例：居酒屋たなか 駅前店" maxlength="100"')}
      <label class="au-l" for="f_si">業種（シフトの区分・必要人数のひな形が入ります）</label>
      <select id="f_si" class="au-i">${INDUSTRIES().map(t => `<option>${esc(t)}</option>`).join('')}</select>
      <label class="au-l" for="f_ss">会社全体の従業員数（社会保険の判定に使います）</label>
      <select id="f_ss" class="au-i"><option value="">まだ決めない</option><option value="small">50人以下</option><option value="large">51人以上</option></select>
      <label class="row au-c"><input type="checkbox" id="f_sx" checked><span>サンプルのスタッフも入れる（あとで名前や時給を変えられます）</span></label>
      ${submit('お店を作って始める', 'doCreateStore')}${message()}
      <button class="lk-l" onclick="logout()">ログアウト</button>`);
  }
  return frame('準備ができました', '', `<button class="lk-b" onclick="enterAdmin();render()">管理画面を開く</button>`);
}

/** お店のデータを読み込んでいる間（または読み込めなかったとき）の管理画面 */
export function storeLoadingView() {
  if (storeLoadError) return `<div class="card" style="max-width:640px;margin:0 auto"><h2>お店のデータを読み込めませんでした</h2>
    <p class="small" style="color:var(--bad);margin-bottom:12px">${esc(storeLoadError)}</p><div class="row"><button class="b" onclick="retryStoreLoad()">もう一度読み込む</button><button class="b2" onclick="logout()">ログアウト</button></div></div>`;
  return `<div class="card empty" style="max-width:640px;margin:0 auto">お店のデータを読み込んでいます…</div>`;
}
