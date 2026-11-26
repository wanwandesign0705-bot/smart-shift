// テスト用の「偽の Supabase」。Playwright の通信の横取り（page.route）で使う。
// ログイン（/auth/v1）と、データベースの窓口（/rest/v1、PostgREST）のうち、このアプリが使う分だけを真似する。
// 送られた行は表ごとに覚えておくので、ページを開き直すと、保存した内容がそのまま読み込まれる。
// 守り（RLS）はここでは真似しない。守りは tests/schema-test.sql と tests/cloud-rows-test.sql で、本物と同じ DB で確かめる。

const PK = {
  stores: ['id'], store_members: ['store_id', 'user_id'], store_settings: ['store_id'], shift_types: ['id'], staff: ['id'],
  staff_private: ['staff_id'], shift_assignments: ['staff_id', 'work_date'], shift_publications: ['id'], consents: ['id'],
};

function fakeJwt(sub) {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  return b({ alg: 'HS256', typ: 'JWT' }) + '.' + b({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
}

function createFake({ password = 'Tencho2026' } = {}) {
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'tencho@example.com', aud: 'authenticated', role: 'authenticated', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const db = Object.fromEntries(Object.keys(PK).map(t => [t, []]));
  const log = [];
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
    if (p === '/auth/v1/signup') return json(200, { ...user, email: body.email, email_confirmed_at: null, identities: [{}] });
    if (p === '/auth/v1/token') {
      if (body.password !== password) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, { access_token: fakeJwt(user.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh', user });
    }
    if (p === '/auth/v1/user') return json(200, user);
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

    // ---- 表 ----
    const t = p.replace('/rest/v1/', '');
    if (!PK[t]) return json(404, { message: 'テストで用意していない通信: ' + method + ' ' + p });
    const match = parseFilters(url);
    if ((method === 'POST' || method === 'PATCH' || method === 'DELETE') && fail[t]) {
      const m = fail[t]; delete fail[t];
      return json(400, { code: 'P0001', message: m, details: null, hint: null });
    }
    if (method === 'GET' || method === 'HEAD') {
      let rows = embed(t, db[t].filter(match));
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
      const upsert = (h['prefer'] || '').includes('resolution=merge-duplicates');
      for (const r0 of list) {
        const r = { ...r0 };
        if (t === 'shift_publications' && !r.id) { r.id = 'pub' + seq++; r.published_at = r.published_at || new Date().toISOString(); }
        if (t === 'consents' && !r.id) r.id = seq++;
        if (t === 'staff' && r.active === undefined) r.active = true;   // 本物の DB の初期値（default true）と同じ
        const i = db[t].findIndex(x => key(t, x) === key(t, r));
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
  return { handle, db, log, sent, fail, user, password };
}

module.exports = { createFake };
