// テスト用の「偽の Supabase」。Playwright の通信の横取り（page.route）で使う。
// ログイン（/auth/v1）と、データベースの窓口（/rest/v1、PostgREST）のうち、このアプリが使う分だけを真似する。
// 送られた行は表ごとに覚えておくので、ページを開き直すと、保存した内容がそのまま読み込まれる。
// 守り（RLS）はここでは真似しない。守りは tests/schema-test.sql と tests/cloud-rows-test.sql で、本物と同じ DB で確かめる。

const PK = {
  stores: ['id'], store_members: ['store_id', 'user_id'], store_settings: ['store_id'], shift_types: ['id'], staff: ['id'],
  staff_private: ['staff_id'], shift_assignments: ['staff_id', 'work_date'], shift_publications: ['id'], consents: ['id'],
  staff_invites: ['id'], requests: ['id'], announcements: ['id'], announcement_reads: ['announcement_id', 'staff_id'],
};

function fakeJwt(sub, anon = false) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub, role: 'authenticated', aud: 'authenticated', is_anonymous: anon, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
}
// 通信の Authorization から、だれが呼んだかを読む（ログイン前は null）
function callerOf(h) {
  const t = (h['authorization'] || '').replace(/^Bearer /, '');
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).sub || null; } catch (e) { return null; }
}

function createFake({ password = 'Tencho2026' } = {}) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'tencho@example.com', aud: 'authenticated', role: 'authenticated', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const db = Object.fromEntries(Object.keys(PK).map(t => [t, []]));
  const log = [];
  const users = { [user.id]: user };    // 招待リンクで参加したスタッフ（匿名ログイン）もここに増える
  const session = u => ({ access_token: fakeJwt(u.id, u.is_anonymous), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-' + u.id, user: u });
  const isAnon = id => !!(users[id] && users[id].is_anonymous);
  // スタッフ（匿名ログイン）から見える範囲を、本物の RLS と同じように絞る（守りそのものは SQL のテストで確かめる）
  function visible(t, rows, caller) {
    if (!isAnon(caller)) return rows;
    const me = db.staff.find(s => s.user_id === caller);
    if (!me) return [];
    const mine = rows.filter(r => (r.store_id || (t === 'stores' ? r.id : null)) === me.store_id);
    if (['staff_private', 'store_settings', 'staff_invites', 'store_members'].includes(t)) return [];
    if (t === 'staff') return mine.filter(s => s.id === me.id);              // 名簿は自分の1行だけ（003）
    if (t === 'requests') return mine.filter(x => x.staff_id === me.id);     // 申請は自分の分だけ（004）
    if (t === 'announcement_reads') return mine.filter(x => x.staff_id === me.id);
    if (t === 'shift_assignments') {                                         // シフトは自分の公開済みの分だけ（003）
      const pubs = db.shift_publications.filter(p => p.store_id === me.store_id);
      return mine.filter(c => c.staff_id === me.id && pubs.some(p => c.work_date >= p.start_date && c.work_date <= p.end_date));
    }
    return mine;
  }
  const fail = {};                      // fail[table] = 'staff_limit_exceeded …' など。次の書き込みを1回だけ失敗させる
  let seq = 1;

  const key = (t, r) => PK[t].map(k => r[k]).join('|');
  function parseFilters(url) {
    const f = [];
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      const m = v.match(/^(eq|in)\.(.*)$/);
      if (!m) continue;
      const vals = m[1] === 'in' ? m[2].replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, '')) : [m[2]];
      f.push(r => vals.includes(String(r[k])));
    }
    return r => f.every(fn => fn(r));
  }
  function embed(t, rows) {
    if (t === 'store_members') return rows.map(r => ({ ...r, stores: db.stores.find(s => s.id === r.store_id) || null }));
    return rows;
  }

  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method(), h = req.headers();
    let body = null; try { body = req.postDataJSON(); } catch (e) { body = req.postData(); }
    log.push({ method, path: p, search: url.search, body, headers: h });
    const json = (status, data, extra = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: extra });

    // ---- ログイン ----
    if (p === '/auth/v1/signup' && !body.email) {           // 匿名ログイン（招待リンクのスタッフ）
      const u = { id: '33333333-3333-4333-8333-' + String(seq++).padStart(12, '0'), aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
      users[u.id] = u;
      return json(200, session(u));
    }
    if (p === '/auth/v1/signup') return json(200, { ...user, email: body.email, email_confirmed_at: null, identities: [{}] });
    if (p === '/auth/v1/token') {
      if (body.password !== password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session(user));
    }
    if (p === '/auth/v1/user') { const u = users[callerOf(h)]; return u ? json(200, u) : json(401, { msg: 'invalid JWT' }); }
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
    if (p === '/auth/v1/recover') return json(200, {});

    // ---- 関数 ----
    if (p === '/rest/v1/rpc/create_store') {
      const id = '22222222-2222-4222-8222-' + String(seq++).padStart(12, '0');
      db.stores.push({ id, name: body.p_name, industry: body.p_industry, company_size: body.p_company_size, request_deadline: 20 });
      db.store_members.push({ store_id: id, user_id: user.id, role: 'owner' });
      db.store_settings.push({ store_id: id, span: 'm1', need: [3, 3, 3, 3, 3, 3, 3], bonus: { fri: 0, sat: 0, end: 0 }, patterns: [], budget: 0, rules: { maxRun: 6, interval: 11 } });
      return json(200, id);
    }

    const caller = callerOf(h);
    if (p === '/rest/v1/rpc/create_invite') {
      const st = db.staff.find(s => s.id === body.p_staff);
      if (!st || caller !== user.id) return json(400, { code: '42501', message: 'not_allowed: この店のスタッフではありません' });
      db.staff_invites.forEach(i => { if (i.staff_id === st.id && !i.used_at) i.used_at = new Date().toISOString(); });
      const token = 'tok' + String(seq++).padStart(45, '0');
      db.staff_invites.push({ id: 'inv' + seq, store_id: st.store_id, staff_id: st.id, token_hash: 'hash(' + token + ')', expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), used_at: null });
      return json(200, token);
    }
    if (p === '/rest/v1/rpc/redeem_invite') {
      const inv = db.staff_invites.find(i => i.token_hash === 'hash(' + body.p_token + ')' && !i.used_at);
      if (!caller) return json(401, { code: '42501', message: 'not_allowed: ログインが必要です' });
      if (!inv) return json(400, { code: 'P0001', message: 'invalid_invite: 招待リンクが無効か、期限切れです。店長に再発行を頼んでください' });
      db.staff.forEach(s => { if (s.user_id === caller) s.user_id = null; });
      db.staff.find(s => s.id === inv.staff_id).user_id = caller;
      inv.used_at = new Date().toISOString();
      return json(200, inv.staff_id);
    }
    if (p === '/rest/v1/rpc/take_swap') {
      const me = db.staff.find(x => x.user_id === caller), q = db.requests.find(x => x.id === body.p_request);
      if (!me || !q) return json(400, { code: '42501', message: 'not_allowed: この店のスタッフではありません' });
      if (q.kind !== 'swap' || q.status !== 'open') return json(400, { code: 'P0001', message: 'not_open: この交代はもう募集していません' });
      if (q.staff_id === me.id) return json(400, { code: 'P0001', message: 'not_allowed: 自分の交代募集は引き受けられません' });
      q.taker_staff_id = me.id; q.status = 'pending'; q.taken_at = new Date().toISOString();
      return json(200, null);
    }
    if (p === '/rest/v1/rpc/swap_board') {                    // 本物の swap_board と同じ形（理由は返さない）
      const me = db.staff.find(x => x.user_id === caller && x.store_id === body.p_store);
      if (!me) return json(200, []);
      const today = new Date().toISOString().slice(0, 10), nm = id => (db.staff.find(x => x.id === id) || {}).name || null;
      const rows = db.requests.filter(q => q.store_id === body.p_store && q.kind === 'swap' &&
        ((q.status === 'open' && q.staff_id !== me.id && q.work_date >= today) || q.taker_staff_id === me.id || q.staff_id === me.id));
      return json(200, rows.map(q => {
        const t = db.shift_types.find(x => x.id === q.shift_type_id) || {}, mineQ = q.staff_id === me.id;
        return { request_id: q.id, relation: mineQ ? 'mine' : q.taker_staff_id === me.id ? 'taken' : 'open', work_date: q.work_date,
          shift_name: t.name || null, shift_time: t.time_range || null, status: q.status,
          other_staff_id: mineQ ? q.taker_staff_id : q.staff_id, other_name: mineQ ? nm(q.taker_staff_id) : nm(q.staff_id), created_at: q.created_at };
      }));
    }
    if (p === '/rest/v1/rpc/my_wage') {
      const me = db.staff.find(s => s.user_id === caller && s.store_id === body.p_store);
      const w = me && db.staff_private.find(x => x.staff_id === me.id);
      return json(200, w ? w.wage : null);
    }

    // ---- 表 ----
    const t = p.replace('/rest/v1/', '');
    if (!PK[t]) return json(404, { message: 'テストで用意していない通信: ' + method + ' ' + p });
    const match = parseFilters(url);
    if ((method === 'POST' || method === 'PATCH' || method === 'DELETE') && fail[t]) {
      const m = fail[t]; delete fail[t];
      return json(400, { code: 'P0001', message: m, details: null, hint: null });
    }
    if (method === 'GET' || method === 'HEAD') {
      let rows = embed(t, visible(t, db[t], caller).filter(match));
      const order = url.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1)); }
      const range = (h['range'] || '').match(/(\d+)-(\d+)/);
      const off = +(url.searchParams.get('offset') || (range ? range[1] : 0)), lim = url.searchParams.get('limit') ? +url.searchParams.get('limit') : range ? +range[2] - +range[1] + 1 : 1000;
      rows = rows.slice(off, off + Math.min(lim, 1000));      // 本物の Supabase と同じく、1回に返すのは最大1000行
      if ((h['accept'] || '').includes('vnd.pgrst.object')) {
        if (rows.length !== 1 && !url.searchParams.has('limit')) {
          if (rows.length === 0 && (h['accept'] || '').includes('nulls=stripped')) return json(200, null);
          if (rows.length === 0) return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
        }
        return json(200, rows[0] ?? null);
      }
      return json(200, rows, { 'content-range': `${off}-${off + rows.length - 1}/*` });
    }
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const upsert = (h['prefer'] || '').includes('resolution=merge-duplicates'), ignore = (h['prefer'] || '').includes('resolution=ignore-duplicates');
      for (const r0 of list) {
        const r = { ...r0 };
        if (t === 'shift_publications' && !r.id) { r.id = 'pub' + seq++; r.published_at = r.published_at || new Date().toISOString(); }
        if (t === 'consents' && !r.id) r.id = seq++;
        if (t === 'staff' && r.active === undefined) r.active = true;   // 本物の DB の初期値（default true）と同じ
        if ((t === 'requests' || t === 'announcements') && !r.created_at) r.created_at = new Date(Date.now() + seq++).toISOString();
        if (t === 'requests') { r.taker_staff_id = r.taker_staff_id ?? null; r.note = r.note ?? ''; }
        const i = db[t].findIndex(x => key(t, x) === key(t, r));
        if (i >= 0 && ignore) continue;
        if (i >= 0) { if (!upsert) return json(409, { code: '23505', message: 'duplicate key value violates unique constraint' }); db[t][i] = { ...db[t][i], ...r }; }
        else db[t].push(r);
      }
      return route.fulfill({ status: 201, body: '' });
    }
    if (method === 'PATCH') { db[t] = db[t].map(r => (match(r) ? { ...r, ...body } : r)); return route.fulfill({ status: 204, body: '' }); }
    if (method === 'DELETE') {
      if (t === 'staff') {                                   // 本物と同じく、名簿を消すと時給とシフトも消える
        const gone = new Set(db.staff.filter(match).map(r => r.id));
        db.staff_private = db.staff_private.filter(r => !gone.has(r.staff_id));
        db.shift_assignments = db.shift_assignments.filter(r => !gone.has(r.staff_id));
      }
      if (t === 'shift_types') {                             // シフト区分を消すと、その区分のシフトは「区分なし」になる
        const gone = new Set(db.shift_types.filter(match).map(r => r.id));
        db.shift_assignments.forEach(r => { if (gone.has(r.shift_type_id)) r.shift_type_id = null; });
      }
      db[t] = db[t].filter(r => !match(r));
      return route.fulfill({ status: 204, body: '' });
    }
    return json(405, { message: method });
  }

  const sent = (path, method) => log.filter(r => r.path === path && (!method || r.method === method));
  return { handle, db, log, sent, fail, user, users, password };
}

module.exports = { createFake };
