// このファイルの関数・定数は main.js で window に登録され、画面のどこからでも名前で呼べます。
/* ===================== データ層 =====================
   読み込み・保存は、すべてこのファイルを通します。画面や計算のファイルは保存先を知りません。
   いまの保存先はブラウザ内（localStorage）です。作業4で Supabase に替えるときは、
   下の「保存先」の関数の中身だけを書き換えれば、画面側は変えずに済みます。

   保存しているもの
   - 店舗データ：設定・シフト区分・名簿・時給・シフト・希望休・メモ・予約・社内連絡・プラン（1つのまとまり）
   - 申請：有給・希望休・シフト交代
   - この端末だけの設定：自分の名前、開いていたタブ、既読のバージョン（本番でも端末に置く）
*/

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
