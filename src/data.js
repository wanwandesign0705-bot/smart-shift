// このファイルの関数・定数は main.js で window に登録され、画面のどこからでも名前で呼べます。
/* ===================== データ層 =====================
   読み込み・保存は、すべてこのファイルを通します。画面や計算のファイルは保存先を知りません。
   いまの保存先はブラウザ内（localStorage）です。作業4で Supabase に替えるときは、
   下の「保存先」の関数の中身だけを書き換えれば、画面側は変えずに済みます。

   保存しているもの
   - 店舗データ：設定・シフト区分・名簿・時給・シフト・希望休・メモ・予約・社内連絡・プラン（1つのまとまり）
   - 申請：有給・希望休・シフト交代
   - この端末だけの設定：自分の名前、開いていたタブ、既読のバージョン（本番でも端末に置く）
   - 店長のアカウントと店舗（作業3から Supabase。下の「アカウントと店舗」）
*/

import { createClient } from '@supabase/supabase-js';

const KEY = {
  store: 'ssm7',          // 店舗データ（v2.3）
  legacyStore: 'shiftApp6', // v2.2 以前の店舗データ。見つかれば読み込んで変換する
  requests: 'ssm7_reqs',
  pref: { me: 'ssm_me', tab: 'ssm_tab', seenVersion: 'ssm_seen' },
};

function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

/* ---------- 保存先（Supabase に替えるときはここを書き換える） ---------- */

/** 店舗データを読む。v2.3 の保存がなければ v2.2 以前の保存を、それもなければ null を返す */
export function loadStore() { return read(KEY.store) || null; }
export function loadLegacyStore() { return read(KEY.legacyStore); }
/** 前に使ったことがあるか（アップデートのお知らせを出すかどうかに使う） */
export function hasSavedStore() { return !!read(KEY.store) || !!read(KEY.legacyStore); }
export function saveStore(data) { return write(KEY.store, data); }

// 申請は保存に失敗しても画面の上では消えないよう、読み込んだ一覧を手元に持っておく（v2.3 と同じ動き）
let requestCache = null;
const requestList = () => (requestCache ??= read(KEY.requests) || []);
export async function loadRequests() { return requestList(); }
export async function createRequest(req) { const l = requestList(); l.push(req); write(KEY.requests, l); return l; }
export async function updateRequest(id, patch) { const l = requestList(), r = l.find(x => x.id === id); if (r) Object.assign(r, patch); write(KEY.requests, l); return l; }
export async function deleteRequest(id) { requestCache = requestList().filter(x => x.id !== id); write(KEY.requests, requestCache); return requestCache; }

/** この端末だけの設定（name は 'me' | 'tab' | 'seenVersion'） */
export function getPref(name) { return read(KEY.pref[name]); }
export function setPref(name, value) { return write(KEY.pref[name], value); }

/* ---------- アプリから呼ぶ口（画面はこの2つだけを使う） ---------- */

/** 店舗データ S を保存する */
export function save() { saveStore(S); }

/** 申請の追加・更新・削除。終わったら画面を描き直す */
export const REQ = {
  async add(r) {
    r.id = 'q' + Date.now() + Math.random().toString(36).slice(2, 6); r.createdAt = new Date().toISOString(); if (myUid) r.uid = myUid;
    try { R = await createRequest(r); } catch (e) { toast('送信できませんでした：' + (e.message || e.code)); return false; }
    render(); return true;
  },
  async upd(id, p) {
    try { R = await updateRequest(id, p); } catch (e) { toast('更新できませんでした：' + (e.message || e.code)); return false; }
    render(); return true;
  },
  async del(id) {
    try { R = await deleteRequest(id); } catch (e) { toast('削除できませんでした'); return; }
    render();
  },
};

/* ===================== アカウントと店舗（Supabase） =====================
   .env に VITE_SUPABASE_URL と VITE_SUPABASE_PUBLISHABLE_KEY があるときだけ使う。
   ないときは、これまでどおりパスワードのロック画面で動く（見た目の比較テストもこちらで行う）。
   ここで使う鍵は公開してよい Publishable key だけ。守りはデータベースの RLS が担う。
*/
const SB_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const cloudEnabled = !!(SB_URL && SB_KEY);
const sb = cloudEnabled ? createClient(SB_URL, SB_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;

/** メールの確認やパスワード再設定のリンクから戻ってくる先（Supabase の Redirect URLs に登録が必要） */
const returnUrl = () => location.origin + location.pathname;

/** Supabase のエラーを、画面に出す日本語にする */
export function accountError(e) {
  const m = String((e && (e.message || e.msg || e.error_description)) || e || '');
  const code = (e && (e.code || e.error_code)) || '';
  if (/Invalid login credentials/i.test(m)) return 'メールアドレスかパスワードが違います。';
  if (/Email not confirmed/i.test(m) || code === 'email_not_confirmed') return 'メールアドレスの確認がまだです。届いたメールのリンクを開いてください。';
  if (/already registered|already been registered/i.test(m) || code === 'user_already_exists') return 'このメールアドレスはすでに登録されています。ログインしてください。';
  if (/captcha/i.test(m) || code === 'captcha_failed') return 'ロボットではないことの確認に失敗しました。確認の枠が「成功」になってから、もう一度押してください。';
  if (/Password should be|weak_password/i.test(m) || code === 'weak_password') return 'パスワードが短すぎるか、簡単すぎます。8文字以上で、英字と数字をまぜてください。';
  if (/rate limit|too many/i.test(m) || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return '短い時間に何度も送られました。しばらく待ってから、もう一度お試しください。';
  if (/consent_required/.test(m)) return '利用規約とプライバシーポリシーへの同意が必要です。';
  if (/staff_limit_exceeded/.test(m)) return 'プランのスタッフ上限を超えています。';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'インターネットにつながっていないようです。接続を確かめて、もう一度お試しください。';
  return 'うまくいきませんでした（' + m.slice(0, 120) + '）';
}

/** ログイン中の状態と、同意・店舗を読む。ログインしていなければ user は null */
export async function loadAccount() {
  if (!sb) return { user: null, consented: false, store: null };
  const { data: { session } } = await sb.auth.getSession();
  const user = session ? session.user : null;
  if (!user || user.is_anonymous) return { user, consented: false, store: null };
  const [c, m] = await Promise.all([
    sb.from('consents').select('document, version').eq('user_id', user.id),
    sb.from('store_members').select('store_id, stores(id, name, industry, company_size)').eq('user_id', user.id).limit(1),
  ]);
  if (c.error) throw c.error;
  if (m.error) throw m.error;
  const has = d => (c.data || []).some(x => x.document === d && x.version === LEGAL.ver);
  const row = (m.data || [])[0];
  return { user, consented: has('terms') && has('privacy'), store: row ? row.stores : null };
}

/** ログイン状態が変わったとき（メールのリンクから戻ったとき、ログアウトしたとき など）に呼ぶ */
export function onAccountChange(cb) { if (sb) sb.auth.onAuthStateChange((event) => cb(event)); }

export async function signUp(email, password, captchaToken) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { captchaToken, emailRedirectTo: returnUrl() } });
  if (error) throw error;
  return { needsConfirm: !data.session };
}
export async function signIn(email, password, captchaToken) {
  const { error } = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (error) throw error;
}
export async function signOut() { if (sb) await sb.auth.signOut(); }
export async function requestPasswordReset(email, captchaToken) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { captchaToken, redirectTo: returnUrl() });
  if (error) throw error;
}
export async function setNewPassword(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw error;
}

/** 利用規約とプライバシーポリシーへの同意を、版と一緒に記録する */
export async function saveConsents(userId) {
  const { error } = await sb.from('consents').insert([
    { user_id: userId, document: 'terms', version: LEGAL.ver },
    { user_id: userId, document: 'privacy', version: LEGAL.ver },
  ]);
  if (error) throw error;
}

/** 業種テンプレートを、データベースの行の形にする（withSample=false ならサンプルのスタッフは入れない） */
export function templateRows(storeId, industry, withSample, newId = () => crypto.randomUUID()) {
  const t = build(industry);
  const ids = Object.fromEntries(t.shifts.map(x => [x.id, newId()]));
  const shiftTypes = t.shifts.map((x, i) => ({
    id: ids[x.id], store_id: storeId, name: x.name, time_range: x.time || '', color: x.color,
    min_staff: +x.min || 0, break_hours: x.brk == null || x.brk === '' ? null : +x.brk,
    next_day_off: !!x.ake, is_off: x.name === '休み', sort_order: i,
  }));
  const people = withSample ? t.staff : [];
  const staff = [], wages = [];
  people.forEach((x, i) => {
    const id = newId();
    staff.push({
      id, store_id: storeId, name: x.name, role: x.role, work_mode: x.mode,
      fixed_days: Object.fromEntries(Object.entries(x.fix || {}).filter(([, v]) => ids[v]).map(([d, v]) => [d, ids[v]])),
      hire_date: x.hire, work_days: x.wdays, pl_hours: x.plHours, fuyo_limit: x.fuyo,
      is_student: !!x.student, long_term: x.longEmp !== false, sort_order: i,
    });
    wages.push({ staff_id: id, store_id: storeId, wage: x.wage });
  });
  const settings = { need: t.need, bonus: t.bonus, patterns: t.pats };
  return { shiftTypes, staff, wages, settings };
}

/** 店舗を作り、業種テンプレートを入れる。作った店舗を返す */
export async function createStoreWithTemplate({ name, industry, companySize, withSample }) {
  const { data: storeId, error } = await sb.rpc('create_store', { p_name: name, p_industry: industry, p_company_size: companySize || null });
  if (error) throw error;
  const rows = templateRows(storeId, industry, withSample);
  const steps = [
    () => sb.from('shift_types').insert(rows.shiftTypes),
    () => rows.staff.length ? sb.from('staff').insert(rows.staff) : { error: null },
    () => rows.wages.length ? sb.from('staff_private').insert(rows.wages) : { error: null },
    () => sb.from('store_settings').update(rows.settings).eq('store_id', storeId),
  ];
  for (const step of steps) {
    const { error: e } = await step();
    if (e) { e.storeCreated = true; throw e; }
  }
  return { id: storeId, name, industry, company_size: companySize || null };
}
