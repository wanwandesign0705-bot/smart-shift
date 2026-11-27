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

/* ---------- アプリから呼ぶ口（画面は save() と REQ だけを使う。save() はこのファイルの下のほう） ---------- */


/** 申請の追加・更新・削除。終わったら画面を描き直す */
export const REQ = {
  async add(r) {
    if (cloud) return cloudReqAdd(r);
    r.id = 'q' + Date.now() + Math.random().toString(36).slice(2, 6); r.createdAt = new Date().toISOString(); if (myUid) r.uid = myUid;
    try { R = await createRequest(r); } catch (e) { toast('送信できませんでした：' + (e.message || e.code)); return false; }
    render(); return true;
  },
  async upd(id, p) {
    if (cloud) return cloudReqUpd(id, p);
    try { R = await updateRequest(id, p); } catch (e) { toast('更新できませんでした：' + (e.message || e.code)); return false; }
    render(); return true;
  },
  async del(id) {
    if (cloud) return cloudReqDel(id);
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
  if (/invalid_invite/.test(m)) return 'この招待リンクは使えません（使用済みか、期限切れです）。店長に再発行を頼んでください。';
  if (/anonymous.*disabled/i.test(m) || code === 'anonymous_provider_disabled') return '招待リンクでの参加が、いまは止められています。店長に連絡してください。';
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

/* ===================== 店舗データの保存先：Supabase（作業4） =====================
   ログインした店長がお店を開いている間は、店舗データ S を Supabase の表に保存する。
   画面は今までどおり save() を呼ぶだけ。ここで S を表の行に変え、前回送った内容と比べて、
   変わった行だけを送る（少し待ってからまとめて送るので、続けて操作しても通信は1回）。

   Supabase に入れるもの：お店（業種・従業員数・締切日）、設定（期間・必要人数・繁忙加算・巡回パターン・予算・労務ルール）、
     シフト区分、名簿、時給、1人1日のシフト・希望休・有給・メモ、公開した期間
   まだこの端末に置くもの（後の作業で移す）：社内連絡・予約（作業6・7）、有給の繰越・調整（作業7）、プラン（作業8）
*/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUB_FROM = '2000-01-01';          // 「この日まで公開」を、DB では「2000-01-01〜この日」の1行で持つ
let cloud = null;                       // { storeId, snap: 前回送った行, timer, running, again, state }
const extrasKey = id => 'ssm7_cloud_extra_' + id;

/** 画面の S の中の、まだ Supabase の形でない ID（'s0' や 't'+時刻）を UUID に付け替える */
export function normalizeIds(S) {
  const map = {};
  const fresh = old => (map[old] = crypto.randomUUID());
  S.shifts.forEach(x => { if (!UUID.test(x.id)) x.id = fresh(x.id); });
  S.staff.forEach(x => { if (!UUID.test(x.id)) x.id = fresh(x.id); });
  let changed = false;
  (S.notices || []).forEach(n => { if (!UUID.test(n.id)) { n.id = crypto.randomUUID(); changed = true; } });
  if (!Object.keys(map).length) return changed;
  const re = v => map[v] || v;
  S.staff.forEach(st => { st.fix = Object.fromEntries(Object.entries(st.fix || {}).map(([d, v]) => [d, re(v)])); });
  for (const k of ['grid', 'wish']) S[k] = Object.fromEntries(Object.entries(S[k] || {}).map(([sid, days]) => [re(sid), k === 'grid' ? Object.fromEntries(Object.entries(days || {}).map(([d, v]) => [d, re(v)])) : days]));
  S.memo = Object.fromEntries(Object.entries(S.memo || {}).map(([key, v]) => { const i = key.lastIndexOf('_'); return [re(key.slice(0, i)) + key.slice(i), v]; }));
  return true;
}

/** 画面の S を、Supabase の表の行にする */
export function storeToRows(S, storeId) {
  const shiftIds = new Set(S.shifts.map(x => x.id)), staffIds = new Set(S.staff.map(x => x.id));
  const rows = {
    store: { industry: S.industry || '', company_size: S.company || null, request_deadline: Math.min(28, Math.max(1, +S.deadline || 20)) },
    settings: { span: S.span, need: S.need.map(n => +n || 0), bonus: { fri: +S.bonus.fri || 0, sat: +S.bonus.sat || 0, end: +S.bonus.end || 0 }, patterns: [...S.pats], budget: Math.max(0, Math.round(+S.budget || 0)), rules: { maxRun: +S.rules.maxRun || 6, interval: +S.rules.interval || 11 } },
    shiftTypes: S.shifts.map((x, i) => ({
      id: x.id, store_id: storeId, name: x.name, time_range: x.time || '', color: x.color || '#F1F5F9', min_staff: Math.max(0, +x.min || 0),
      break_hours: x.brk == null || x.brk === '' ? null : +x.brk, next_day_off: !!x.ake, is_off: x.name === '休み', sort_order: i,
    })),
    staff: S.staff.map((x, i) => ({
      id: x.id, store_id: storeId, name: x.name, role: x.role || '', work_mode: x.mode || '',
      fixed_days: Object.fromEntries(Object.entries(x.fix || {}).filter(([, v]) => shiftIds.has(v))),
      hire_date: x.hire || null, work_days: Math.min(5, Math.max(1, +x.wdays || 5)), pl_hours: +x.plHours || 8,
      fuyo_limit: +x.fuyo || 0, is_student: !!x.student, long_term: x.longEmp !== false, sort_order: i, active: true,
    })),
    wages: S.staff.map(x => ({ staff_id: x.id, store_id: storeId, wage: Math.max(0, Math.round(+x.wage || 0)) })),
    cells: [],
    pub: S.pubUntil ? { start_date: PUB_FROM, end_date: S.pubUntil } : null,
    notices: (S.notices || []).map(n => ({ id: n.id, store_id: storeId, title: String(n.title || '').slice(0, 200) || '（無題）', body: n.body || '' })),
  };
  const cell = {};
  const at = (sid, d) => (cell[sid + '|' + d] ??= { store_id: storeId, staff_id: sid, work_date: d, shift_type_id: null, leave: null, wish_off: false, memo: '' });
  Object.entries(S.grid || {}).forEach(([sid, days]) => staffIds.has(sid) && Object.entries(days || {}).forEach(([d, v]) => {
    if (v === 'PL' || v === 'PLH') at(sid, d).leave = v === 'PL' ? 'full' : 'half'; else if (shiftIds.has(v)) at(sid, d).shift_type_id = v;
  }));
  Object.entries(S.wish || {}).forEach(([sid, days]) => staffIds.has(sid) && Object.entries(days || {}).forEach(([d, v]) => { if (v) at(sid, d).wish_off = true; }));
  Object.entries(S.memo || {}).forEach(([key, v]) => { const i = key.lastIndexOf('_'), sid = key.slice(0, i); if (v && staffIds.has(sid)) at(sid, key.slice(i + 1)).memo = String(v); });
  rows.cells = Object.values(cell).filter(c => c.shift_type_id || c.leave || c.wish_off || c.memo);
  return rows;
}

/** Supabase の行から、画面の S を作る（base はこの端末に置いている分と初期値） */
export function rowsToStore(r, base) {
  const S = base;
  S.industry = r.store.industry; S.company = r.store.company_size || ''; S.deadline = r.store.request_deadline;
  if (r.settings) {
    S.span = r.settings.span; S.need = [...r.settings.need]; S.bonus = { fri: 0, sat: 0, end: 0, ...r.settings.bonus };
    S.pats = [...r.settings.patterns]; S.budget = r.settings.budget; S.rules = { maxRun: 6, interval: 11, ...r.settings.rules };
  }
  S.shifts = r.shiftTypes.map(x => ({ id: x.id, name: x.name, time: x.time_range, color: x.color, min: x.min_staff, brk: x.break_hours == null ? null : +x.break_hours, ake: x.next_day_off }));
  const wage = Object.fromEntries(r.wages.map(w => [w.staff_id, w.wage]));
  const adj = (base.plAdjById || {});
  S.staff = r.staff.map(x => ({ id: x.id, name: x.name, role: x.role, wage: wage[x.id] ?? 0, mode: x.work_mode, fix: { ...x.fixed_days },
    hire: x.hire_date || '', wdays: x.work_days, plAdj: adj[x.id] || 0, plHours: +x.pl_hours, fuyo: x.fuyo_limit, student: x.is_student, longEmp: x.long_term }));
  S.grid = {}; S.wish = {}; S.memo = {};
  r.cells.forEach(c => {
    const v = c.leave === 'full' ? 'PL' : c.leave === 'half' ? 'PLH' : c.shift_type_id;
    if (v) (S.grid[c.staff_id] ??= {})[c.work_date] = v;
    if (c.wish_off) (S.wish[c.staff_id] ??= {})[c.work_date] = true;
    if (c.memo) S.memo[c.staff_id + '_' + c.work_date] = c.memo;
  });
  const pub = r.pub;
  S.pubUntil = pub ? pub.end_date : ''; S.pubAt = pub ? pub.published_at || '' : '';
  if (r.notices) S.notices = r.notices.map(n => ({ id: n.id, date: (n.created_at || '').slice(0, 10) || iso(new Date()), title: n.title, body: n.body }));
  return S;
}

/** 前回送った行と比べて、送る操作の一覧を作る（消す → 足す・直す の順。決まった順で並べる） */
export function diffRows(prev, next) {
  const ops = [];
  const byKey = (list, key) => new Map((list || []).map(x => [key(x), x]));
  const tables = [
    ['announcements', 'notices', n => n.id, n => ({ id: n.id })],
    ['shift_assignments', 'cells', c => c.staff_id + '|' + c.work_date, c => ({ staff_id: c.staff_id, work_date: c.work_date })],
    ['staff_private', 'wages', w => w.staff_id, w => ({ staff_id: w.staff_id })],
    ['staff', 'staff', s => s.id, s => ({ id: s.id })],
    ['shift_types', 'shiftTypes', s => s.id, s => ({ id: s.id })],
  ];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [table, k, key, match] of tables) {             // 消すもの（シフト → 時給 → 名簿 → 区分）
    const now = byKey(next[k], key);
    const gone = (prev ? prev[k] : []).filter(x => !now.has(key(x)));
    if (table === 'shift_assignments') { if (gone.length) ops.push({ table, op: 'deleteCells', rows: gone.map(match) }); }
    else if (gone.length) ops.push({ table, op: 'delete', ids: gone.map(x => Object.values(match(x))[0]) });
  }
  for (const [table, k, key] of [...tables].reverse()) {      // 足す・直すもの（区分 → 名簿 → 時給 → シフト）
    const before = byKey(prev ? prev[k] : [], key);
    const changed = next[k].filter(x => !same(before.get(key(x)), x));
    if (changed.length) ops.push({ table, op: 'upsert', rows: changed });
  }
  if (!prev || !same(prev.store, next.store)) ops.push({ table: 'stores', op: 'update', row: next.store });
  if (!prev || !same(prev.settings, next.settings)) ops.push({ table: 'store_settings', op: 'update', row: next.settings });
  if (!prev || !same(prev.pub, next.pub)) ops.push({ table: 'shift_publications', op: 'replace', row: next.pub });
  return ops;
}

async function runOp(storeId, o) {
  const need = r => { if (r.error) throw r.error; return r; };
  if (o.op === 'upsert') {
    for (let i = 0; i < o.rows.length; i += 500) need(await sb.from(o.table).upsert(o.rows.slice(i, i + 500)));
  } else if (o.op === 'delete') {
    const col = o.table === 'staff_private' ? 'staff_id' : 'id';
    for (let i = 0; i < o.ids.length; i += 100) need(await sb.from(o.table).delete().eq('store_id', storeId).in(col, o.ids.slice(i, i + 100)));
  } else if (o.op === 'deleteCells') {
    const byStaff = {};
    o.rows.forEach(c => (byStaff[c.staff_id] ??= []).push(c.work_date));
    for (const [sid, days] of Object.entries(byStaff))
      for (let i = 0; i < days.length; i += 100) need(await sb.from('shift_assignments').delete().eq('store_id', storeId).eq('staff_id', sid).in('work_date', days.slice(i, i + 100)));
  } else if (o.op === 'update') {
    need(await sb.from(o.table).update(o.row).eq(o.table === 'stores' ? 'id' : 'store_id', storeId));
  } else if (o.op === 'replace') {
    need(await sb.from('shift_publications').delete().eq('store_id', storeId));
    if (o.row) need(await sb.from('shift_publications').insert({ store_id: storeId, ...o.row }));
  }
}

async function selectAll(q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** お店のデータを Supabase から読み、画面の S を作る。読み込んだあとは save() が Supabase に送る */
export async function openCloudStore(storeId) {
  const one = async q => { const { data, error } = await q; if (error) throw error; return data; };
  const [store, settings, shiftTypes, staff, wages, cells, pubs, notices] = await Promise.all([
    one(sb.from('stores').select('id, name, industry, company_size, request_deadline').eq('id', storeId).single()),
    one(sb.from('store_settings').select('span, need, bonus, patterns, budget, rules').eq('store_id', storeId).maybeSingle()),
    selectAll(() => sb.from('shift_types').select('*').eq('store_id', storeId).order('sort_order')),
    selectAll(() => sb.from('staff').select('*').eq('store_id', storeId).eq('active', true).order('sort_order')),
    selectAll(() => sb.from('staff_private').select('staff_id, store_id, wage').eq('store_id', storeId)),
    selectAll(() => sb.from('shift_assignments').select('store_id, staff_id, work_date, shift_type_id, leave, wish_off, memo').eq('store_id', storeId).order('work_date')),
    one(sb.from('shift_publications').select('start_date, end_date, published_at').eq('store_id', storeId).order('end_date', { ascending: false }).limit(1)),
    selectAll(() => sb.from('announcements').select('id, title, body, created_at').eq('store_id', storeId).order('created_at', { ascending: false })),
  ]);
  const extras = read(extrasKey(storeId)) || {};
  const base = migrate({ ...def(), ...extras, grid: {}, wish: {}, memo: {} });
  base.plAdjById = extras.plAdjById || {};
  const S = rowsToStore({ store, settings, shiftTypes, staff, wages, cells, pub: pubs[0] || null, notices }, base);
  delete S.plAdjById;
  cloud = { storeId, snap: null, timer: null, running: false, again: false, state: 'saved' };
  cloud.snap = storeToRows(S, storeId);
  return S;
}

/** お店を閉じる（ログアウトしたとき）。以後の save() はこの端末に保存する */
export function closeCloudStore() { if (cloud) clearTimeout(cloud.timer); cloud = null; }
export const cloudStoreOpen = () => !!cloud && !cloud.readOnly;
export const cloudSaveState = () => (cloud ? cloud.state : 'local');

function saveExtras(S) {
  write(extrasKey(cloud.storeId), { res: S.res, plan: S.plan, apw: S.apw, consent: S.consent,
    plAdjById: Object.fromEntries(S.staff.map(x => [x.id, +x.plAdj || 0])) });
}

async function syncNow() {
  if (!cloud || cloud.running) { if (cloud) cloud.again = true; return; }
  cloud.running = true; cloud.again = false; cloud.state = 'saving'; render();
  const c = cloud;
  try {
    if (normalizeIds(S)) render();
    const next = storeToRows(S, c.storeId);
    for (const o of diffRows(c.snap, next)) {
      await runOp(c.storeId, o);
      if (cloud !== c) return;
    }
    c.snap = next; c.state = 'saved';
  } catch (e) {
    c.state = 'error';
    toast('保存できませんでした：' + accountError(e) + '（画面を開き直すと、最後に保存できた状態に戻ります）');
  } finally {
    c.running = false;
    if (cloud === c && c.again) syncNow(); else render();
  }
}

/** 店舗データ S を保存する。お店を Supabase で開いているときは Supabase に、そうでなければこの端末に */
export function save() {
  if (!cloud) { saveStore(S); return; }
  if (cloud.readOnly) return;            // スタッフの端末：保存しない
  saveExtras(S);
  cloud.state = 'pending';
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(syncNow, 600);
}

/** 送っていない変更があるか（ページを閉じる前の確認に使う） */
export const cloudUnsaved = () => !!cloud && !cloud.readOnly && ['pending', 'saving', 'error'].includes(cloud.state);
/** スタッフとして参加している端末か */
export const staffMode = () => !!cloud && !!cloud.readOnly;

/* ===================== スタッフの参加（作業5） =====================
   店長が招待リンクを発行 → スタッフがリンクを開く → ロボット対策のあと匿名でログイン →
   データベースの redeem_invite でトークンを確かめ、その端末をスタッフの名簿の1行に結びつける。
   リンクのトークンは URL の「#」のあと（#invite=…）に置く。「#」のあとはサーバーに送られず、記録にも残らない。
*/
export const inviteUrl = token => location.origin + location.pathname + '#invite=' + token;
export function inviteTokenFromUrl() { const m = location.hash.match(/^#invite=([0-9a-zA-Z]{20,128})$/); return m ? m[1] : null; }
export function clearInviteFromUrl() { history.replaceState(null, '', location.pathname + location.search); }

/** 招待リンクを発行する（前に発行した、まだ使われていないリンクは使えなくなる）。リンクの URL を返す */
export async function createInvite(staffId) {
  const { data, error } = await sb.rpc('create_invite', { p_staff: staffId });
  if (error) throw error;
  return inviteUrl(data);
}

/** 名簿のスタッフごとの参加の状態：joined（参加済み）／invited（リンクを発行済みで未使用）／none */
export async function loadInviteStatus(storeId) {
  const [st, inv] = await Promise.all([
    sb.from('staff').select('id, user_id').eq('store_id', storeId),
    sb.from('staff_invites').select('staff_id, expires_at, used_at').eq('store_id', storeId).is('used_at', null),
  ]);
  if (st.error) throw st.error;
  if (inv.error) throw inv.error;
  const now = new Date().toISOString(), out = {};
  st.data.forEach(s => { out[s.id] = { state: s.user_id ? 'joined' : 'none' }; });
  inv.data.forEach(i => { if (i.expires_at > now && out[i.staff_id] && out[i.staff_id].state !== 'joined') out[i.staff_id] = { state: 'invited', expires: i.expires_at }; });
  return out;
}

/** スタッフの参加を解除する（その端末からは見られなくなる） */
export async function unlinkStaff(storeId, staffId) {
  const { error } = await sb.from('staff').update({ user_id: null }).eq('store_id', storeId).eq('id', staffId);
  if (error) throw error;
}

/** 招待リンクで参加する。まだログインしていなければ、ロボット対策のトークンを使って匿名でログインする */
export async function joinWithInvite(token, captchaToken) {
  const { data: { session } } = await sb.auth.getSession();
  if (session && !session.user.is_anonymous) throw new Error('owner_session');
  if (!session) {
    const { error } = await sb.auth.signInAnonymously({ options: { captchaToken } });
    if (error) throw error;
  }
  const { data, error } = await sb.rpc('redeem_invite', { p_token: token });
  if (error) throw error;
  return data;
}

/** スタッフとして参加している端末なら、そのお店のデータ（公開されたシフト・名簿・自分の時給）を読む。参加していなければ null */
export async function openStaffStore() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session || !session.user.is_anonymous) return null;
  const me = await sb.from('staff').select('id, store_id').eq('user_id', session.user.id).eq('active', true).maybeSingle();
  if (me.error) throw me.error;
  if (!me.data) return null;
  const storeId = me.data.store_id, one = async q => { const { data, error } = await q; if (error) throw error; return data; };
  const [store, shiftTypes, staff, cells, pubs, wage, notices, reads] = await Promise.all([
    one(sb.from('stores').select('id, name, industry, company_size, request_deadline').eq('id', storeId).single()),
    selectAll(() => sb.from('shift_types').select('*').eq('store_id', storeId).order('sort_order')),
    selectAll(() => sb.from('staff').select('*').eq('store_id', storeId).eq('active', true).order('sort_order')),
    selectAll(() => sb.from('shift_assignments').select('store_id, staff_id, work_date, shift_type_id, leave, wish_off, memo').eq('store_id', storeId).order('work_date')),
    one(sb.from('shift_publications').select('start_date, end_date, published_at').eq('store_id', storeId).order('end_date', { ascending: false }).limit(1)),
    one(sb.rpc('my_wage', { p_store: storeId })),
    selectAll(() => sb.from('announcements').select('id, title, body, created_at').eq('store_id', storeId).order('created_at', { ascending: false })),
    selectAll(() => sb.from('announcement_reads').select('announcement_id').eq('staff_id', me.data.id)),
  ]);
  const base = migrate({ ...def(), grid: {}, wish: {}, memo: {}, notices: [], res: [] });
  const S = rowsToStore({ store, settings: null, shiftTypes, staff, wages: wage == null ? [] : [{ staff_id: me.data.id, wage }], cells, pub: pubs[0] || null, notices }, base);
  // スタッフの端末では保存しない（読むだけ）。この端末の保存にもお店のデータを書かない
  cloud = { storeId, readOnly: true, staffId: me.data.id, snap: null, timer: null, running: false, again: false, state: 'staff' };
  return { S, staffId: me.data.id, storeName: store.name, readIds: reads.map(x => x.announcement_id) };
}

/* ===================== 申請と社内連絡（作業6） =====================
   店長：お店の申請をすべて読み、承認・却下する。社内連絡を出し、既読の人数を見る。
   スタッフ：自分の申請だけを読む。交代の募集は swap_board 関数で「日付・時間帯・相手の名前・状態」だけを読む。
   申請の理由は、店長と本人にしか届かない（データベースが返さない）。
*/
const reqFromRow = r => ({ id: r.id, type: r.kind, staffId: r.staff_id, date: r.work_date, half: !!r.half_day, shiftId: r.shift_type_id,
  reason: r.reason || '', status: r.status, takerId: r.taker_staff_id, note: r.note || '', createdAt: r.created_at, takenAt: r.taken_at, decidedAt: r.decided_at });

/** 申請を読み直す。店長ならお店のすべて、スタッフなら自分の申請と交代の掲示板。{ list, names } を返す */
export async function loadCloudRequests() {
  if (!cloud) return { list: [], names: {} };
  if (!cloud.readOnly) {
    const rows = await selectAll(() => sb.from('requests').select('*').eq('store_id', cloud.storeId).order('created_at', { ascending: false }));
    return { list: rows.map(reqFromRow), names: {} };
  }
  const [mine, board] = await Promise.all([
    selectAll(() => sb.from('requests').select('*').eq('store_id', cloud.storeId).eq('staff_id', cloud.staffId).order('created_at', { ascending: false })),
    (async () => { const { data, error } = await sb.rpc('swap_board', { p_store: cloud.storeId }); if (error) throw error; return data || []; })(),
  ]);
  const names = {}, list = mine.map(reqFromRow);
  board.forEach(b => {
    if (b.other_staff_id) names[b.other_staff_id] = b.other_name;
    if (b.relation === 'mine') return;                                       // 自分の募集は mine に入っている（相手の名前だけ使う）
    list.push({ id: b.request_id, type: 'swap', staffId: b.other_staff_id, date: b.work_date, shiftId: null, shiftName: b.shift_name, shiftTime: b.shift_time,
      status: b.status, takerId: b.relation === 'taken' ? cloud.staffId : null, board: b.relation, createdAt: b.created_at, reason: '' });
  });
  return { list, names };
}

/** 申請を読み直して、画面に反映する */
export async function refreshCloudRequests() {
  if (!cloud) return;
  try { const r = await loadCloudRequests(); R = r.list; nameHints = r.names; }
  catch (e) { toast('申請を読み込めませんでした：' + accountError(e)); }
  render();
}

async function cloudReqAdd(r) {
  const row = { id: crypto.randomUUID(), store_id: cloud.storeId, staff_id: r.staffId, kind: r.type, work_date: r.date, half_day: !!r.half,
    shift_type_id: r.shiftId || null, reason: String(r.reason || '').slice(0, 500), status: r.status };
  const { error } = await sb.from('requests').insert(row);
  if (error) { toast('送信できませんでした：' + accountError(error)); return false; }
  await refreshCloudRequests(); return true;
}
async function cloudReqUpd(id, p) {
  let res;
  if ('takerId' in p) res = await sb.rpc('take_swap', { p_request: id });                       // 交代を引き受ける
  else {
    const patch = { status: p.status }; if (p.note !== undefined) patch.note = String(p.note).slice(0, 500);
    res = await sb.from('requests').update(patch).eq('id', id).eq('store_id', cloud.storeId);
  }
  if (res.error) { toast('更新できませんでした：' + accountError(res.error)); await refreshCloudRequests(); return false; }
  await refreshCloudRequests(); return true;
}
async function cloudReqDel(id) {
  const { error } = await sb.from('requests').delete().eq('id', id).eq('store_id', cloud.storeId);
  if (error) toast('削除できませんでした：' + accountError(error));
  await refreshCloudRequests();
}

/** スタッフが社内連絡を読んだことを記録する（同じものは1回だけ） */
export async function markNoticesRead(ids) {
  if (!cloud || !cloud.readOnly || !ids.length) return;
  const rows = ids.map(id => ({ announcement_id: id, staff_id: cloud.staffId, store_id: cloud.storeId }));
  const { error } = await sb.from('announcement_reads').upsert(rows, { onConflict: 'announcement_id,staff_id', ignoreDuplicates: true });
  if (error) throw error;
}
/** 店長が見る、社内連絡ごとの既読の人数 */
export async function loadNoticeReadCounts() {
  if (!cloud || cloud.readOnly) return {};
  const rows = await selectAll(() => sb.from('announcement_reads').select('announcement_id').eq('store_id', cloud.storeId));
  const out = {}; rows.forEach(x => { out[x.announcement_id] = (out[x.announcement_id] || 0) + 1; }); return out;
}
