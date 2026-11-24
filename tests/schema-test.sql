-- schema.sql のテスト。設計書の「確かめたこと」と、データの守りに関わる点を1つずつ確かめる。
-- 1つでも失敗すると、その場で止まって「FAIL」と理由を表示する。
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
set client_min_messages = notice;

create schema test;
grant usage on schema test to anon, authenticated;

-- 「この人としてログインした」状態にする
create function test.login(p_uid uuid) returns void language plpgsql security definer as $$
declare v_anon boolean;
begin
  select is_anonymous into v_anon from auth.users where id = p_uid;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', coalesce(v_anon, false))::text, false);
end $$;
-- 結果の確認
create function test.ok(p_name text, p_cond boolean) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_name; end if;
  raise notice 'PASS: %', p_name;
end $$;
-- 失敗するはずの操作が、期待どおりのエラーで失敗するか
create function test.fails(p_name text, p_sql text, p_expect text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_expect || '%' then raise notice 'PASS: %（%）', p_name, sqlerrm; return; end if;
    raise exception 'FAIL: % — 想定と違うエラー: %', p_name, sqlerrm;
  end;
  raise exception 'FAIL: % — 失敗するはずが成功した', p_name;
end $$;
-- 行数を数える（呼んだ人の権限で）
create function test.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint; begin execute 'select count(*) from (' || p_sql || ') q' into v; return v; end $$;
grant execute on all functions in schema test to anon, authenticated;

-- 登場人物
insert into auth.users (id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-000000000001', 'owner-a@example.com', false),   -- 店A の店長
  ('b0000000-0000-0000-0000-000000000001', 'owner-b@example.com', false),   -- 店B の店長
  ('c0000000-0000-0000-0000-000000000001', null, true),                    -- 店A のスタッフ（招待リンク）
  ('c0000000-0000-0000-0000-000000000002', null, true),                    -- 店A のスタッフ（招待リンク）
  ('c0000000-0000-0000-0000-000000000009', null, true),                    -- 招待されていない匿名の人
  ('d0000000-0000-0000-0000-000000000001', 'ops@example.com', false);      -- 運営者
insert into public.platform_admins (user_id) values ('d0000000-0000-0000-0000-000000000001');
insert into public.app_updates (kind, title, published) values ('release', '公開済みのお知らせ', true), ('roadmap', '下書き', false);

\echo
\echo '== 0. テーブルと RLS =='
select test.ok('テーブルが20個ある', (select count(*) from pg_tables where schemaname = 'public') = 20);
select test.ok('すべてのテーブルで RLS が有効', not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity));

\echo
\echo '== 1. 店舗の作成と規約への同意 =='
set role authenticated;
select test.login('a0000000-0000-0000-0000-000000000001');
select test.fails('同意の前は店舗を作れない', $$select public.create_store('店A')$$, 'consent_required');
insert into public.consents (user_id, document, version) values
  ('a0000000-0000-0000-0000-000000000001', 'terms', '2026-11-17'),
  ('a0000000-0000-0000-0000-000000000001', 'privacy', '2026-11-17');
select test.fails('他人の名前で同意を記録できない',
  $$insert into public.consents (user_id, document, version) values ('b0000000-0000-0000-0000-000000000001', 'terms', 'x')$$, 'row-level security');
select set_config('test.store_a', public.create_store('店A', '飲食店', 'small')::text, false);
select test.ok('同意のあとは店舗を作れる', current_setting('test.store_a') <> '');
select test.ok('作った直後はトライアルで、実効プランはプロ', public.effective_plan(current_setting('test.store_a')::uuid) = 'pro');
select test.ok('トライアル終了日は2ヶ月後',
  (select trial_ends_at from public.subscriptions where store_id = current_setting('test.store_a')::uuid) = (current_date + interval '2 months')::date);
select test.fails('店長は表に直接お店を足せない', $$insert into public.stores (name) values ('勝手な店')$$, 'permission denied');

select test.login('b0000000-0000-0000-0000-000000000001');
insert into public.consents (user_id, document, version) values
  ('b0000000-0000-0000-0000-000000000001', 'terms', '2026-11-17'), ('b0000000-0000-0000-0000-000000000001', 'privacy', '2026-11-17');
select set_config('test.store_b', public.create_store('店B')::text, false);

select test.login('c0000000-0000-0000-0000-000000000009');
select test.fails('匿名ログインの人は同意を記録できない',
  $$insert into public.consents (user_id, document, version) values ('c0000000-0000-0000-0000-000000000009', 'terms', 'x')$$, 'row-level security');
select test.fails('匿名ログインの人は店舗を作れない', $$select public.create_store('匿名の店')$$, 'not_allowed');

\echo
\echo '== 2. 契約を変えられるのは運営者だけ =='
select test.login('a0000000-0000-0000-0000-000000000001');
select test.fails('店長は契約を直接書き換えられない',
  $$update public.subscriptions set plan = 'pro', status = 'active' where store_id = current_setting('test.store_a')::uuid$$, 'permission denied');
select test.fails('店長は ops_set_plan を使えない',
  $$select public.ops_set_plan(current_setting('test.store_a')::uuid, 'pro', 'active', '自分で')$$, 'not_allowed');
select test.ok('店長は自店の契約を読める', test.n('select * from public.subscriptions') = 1);
select test.ok('店長は変更履歴を読めない', test.n('select * from public.plan_events') = 0);

select test.login('d0000000-0000-0000-0000-000000000001');
select set_config('test.ev_before', (select count(*) from public.plan_events where store_id = current_setting('test.store_b')::uuid)::text, false);
select test.fails('運営者でも理由なしでは変えられない',
  $$select public.ops_set_plan(current_setting('test.store_b')::uuid, 'free', 'canceled', '  ')$$, 'reason_required');
select public.ops_set_plan(current_setting('test.store_b')::uuid, 'free', 'canceled', 'テスト：フリーに戻す');
select test.ok('運営者が変えると、履歴が1件残る',
  (select count(*) from public.plan_events where store_id = current_setting('test.store_b')::uuid) = current_setting('test.ev_before')::int + 1);
select test.ok('履歴に変更前と変更後が残る',
  (select before ->> 'status' = 'trialing' and after ->> 'status' = 'canceled' from public.plan_events
    where store_id = current_setting('test.store_b')::uuid order by id desc limit 1));
select test.ok('フリーに戻した店の実効プランはフリー', public.effective_plan(current_setting('test.store_b')::uuid) = 'free');

\echo
\echo '== 3. スタッフの上限（フリーは5名） =='
select test.login('b0000000-0000-0000-0000-000000000001');
insert into public.staff (store_id, name) select current_setting('test.store_b')::uuid, 'B' || g from generate_series(1, 5) g;
select test.ok('フリーで5人までは登録できる', test.n('select * from public.staff') = 5);
select test.fails('フリーで6人目を登録すると止まる',
  $$insert into public.staff (store_id, name) values (current_setting('test.store_b')::uuid, 'B6')$$, 'staff_limit_exceeded');
update public.staff set active = false where name = 'B5';
insert into public.staff (store_id, name) values (current_setting('test.store_b')::uuid, 'B6');
select test.fails('休止中のスタッフを戻して上限を超えるのも止まる',
  $$update public.staff set active = true where name = 'B5'$$, 'staff_limit_exceeded');

\echo
\echo '== 4. 店長が店Aを準備する =='
select test.login('a0000000-0000-0000-0000-000000000001');
insert into public.shift_types (store_id, name, time_range) values (current_setting('test.store_a')::uuid, '日勤', '09:00-18:00');
insert into public.shift_types (store_id, name, is_off) values (current_setting('test.store_a')::uuid, '休み', true);
insert into public.staff (store_id, name, role) values
  (current_setting('test.store_a')::uuid, '田中', '店長'), (current_setting('test.store_a')::uuid, '山田', 'パート'),
  (current_setting('test.store_a')::uuid, '伊藤', 'パート');
insert into public.staff_private (staff_id, store_id, wage) select id, store_id, 1100 from public.staff;
insert into public.paid_leave_grants (store_id, staff_id, grant_date, days) select store_id, id, '2026-10-01', 10 from public.staff;
insert into public.shift_assignments (store_id, staff_id, work_date, shift_type_id)
  select s.store_id, s.id, d::date, (select id from public.shift_types where name = '日勤')
  from public.staff s, generate_series('2026-11-01'::date, '2026-12-31', '1 day') d;
insert into public.shift_publications (store_id, start_date, end_date) values (current_setting('test.store_a')::uuid, '2026-11-01', '2026-11-30');
insert into public.announcements (store_id, title) values (current_setting('test.store_a')::uuid, '12月の希望休について');
select test.ok('店長は時給を読める', test.n('select * from public.staff_private') = 3);
select test.ok('店長は他店のスタッフを読めない', test.n($$select * from public.staff where store_id = current_setting('test.store_b')::uuid$$) = 0);
select test.ok('店長は他店の時給を読めない', test.n($$select * from public.staff_private where store_id = current_setting('test.store_b')::uuid$$) = 0);
select test.ok('店長は他店の実効プランを知れない', public.effective_plan(current_setting('test.store_b')::uuid) is null);

\echo
\echo '== 5. 招待リンク =='
select set_config('test.tok1', public.create_invite((select id from public.staff where name = '山田')), false);
select set_config('test.tok2', public.create_invite((select id from public.staff where name = '伊藤')), false);
select test.ok('DB にはトークンそのものを保存しない',
  not exists (select 1 from public.staff_invites where token_hash = current_setting('test.tok1')));
reset role;
select set_config('test.yamada', (select id::text from public.staff where name = '山田'), false);
set role authenticated;
select test.login('b0000000-0000-0000-0000-000000000001');
select test.fails('他店の店長は、店Aのスタッフの招待リンクを作れない',
  $$select public.create_invite(current_setting('test.yamada')::uuid)$$, 'not_allowed');

select test.login('c0000000-0000-0000-0000-000000000001');
select test.ok('招待前の匿名の人は店Aの名簿を読めない', test.n('select * from public.staff') = 0);
select public.redeem_invite(current_setting('test.tok1'));
select test.ok('招待リンクを開くとスタッフに結びつく', test.n('select * from public.staff') = 3);
select test.login('c0000000-0000-0000-0000-000000000009');
select test.fails('同じリンクは2回使えない', $$select public.redeem_invite(current_setting('test.tok1'))$$, 'invalid_invite');
select test.fails('でたらめなトークンは使えない', $$select public.redeem_invite('0000')$$, 'invalid_invite');
select test.login('c0000000-0000-0000-0000-000000000002');
select public.redeem_invite(current_setting('test.tok2'));

\echo
\echo '== 6. スタッフから見えないもの =='
select test.login('c0000000-0000-0000-0000-000000000001');
select test.ok('スタッフは時給を読めない', test.n('select * from public.staff_private') = 0);
select test.ok('スタッフは契約を読めない', test.n('select * from public.subscriptions') = 0);
select test.ok('スタッフは店の設定（予算）を読めない', test.n('select * from public.store_settings') = 0);
select test.ok('スタッフは招待リンクを読めない', test.n('select * from public.staff_invites') = 0);
select test.ok('スタッフは公開済みの11月のシフトを読める', test.n($$select * from public.shift_assignments where work_date between '2026-11-01' and '2026-11-30'$$) = 90);
select test.ok('スタッフは未公開の12月のシフトを読めない', test.n($$select * from public.shift_assignments where work_date >= '2026-12-01'$$) = 0);
select test.ok('スタッフは自分の有給付与だけ読める', test.n('select * from public.paid_leave_grants') = 1);
select test.ok('スタッフは他店の店舗・名簿を読めない', test.n('select * from public.stores') = 1 and test.n($$select * from public.staff where store_id = current_setting('test.store_b')::uuid$$) = 0);
select test.ok('スタッフは自店の実効プランを知れる（機能の出し分け用）', public.effective_plan(current_setting('test.store_a')::uuid) = 'pro');
select test.ok('スタッフは決済リンクを読めない', test.n('select * from public.app_config') = 0);
update public.shift_assignments set memo = 'x' where work_date = '2026-11-10';
delete from public.shift_assignments where work_date = '2026-11-11';
reset role;
select test.ok('スタッフはシフトを書き換えも削除もできない（0行で終わる）',
  (select count(*) from public.shift_assignments where memo = 'x') = 0
  and (select count(*) from public.shift_assignments where work_date = '2026-11-11') = 3);
set role authenticated;
select test.fails('スタッフは社内連絡を出せない',
  $$insert into public.announcements (store_id, title) values (current_setting('test.store_a')::uuid, 'x')$$, 'row-level security');
insert into public.announcement_reads (announcement_id, staff_id, store_id)
  select a.id, public.my_staff_id(a.store_id), a.store_id from public.announcements a;
select test.ok('スタッフは社内連絡を既読にできる', test.n('select * from public.announcement_reads') = 1);

\echo
\echo '== 7. 申請：出せるが、自分で承認にはできない =='
insert into public.requests (store_id, staff_id, kind, work_date, status)
  values (current_setting('test.store_a')::uuid, public.my_staff_id(current_setting('test.store_a')::uuid), 'pl', '2026-12-10', 'pending');
select test.ok('スタッフは有給を申請できる', test.n($$select * from public.requests where kind = 'pl'$$) = 1);
select test.fails('スタッフは承認済みの申請を出せない',
  $$insert into public.requests (store_id, staff_id, kind, work_date, status) values (current_setting('test.store_a')::uuid, public.my_staff_id(current_setting('test.store_a')::uuid), 'off', '2026-12-11', 'approved')$$, 'not_allowed');
select test.fails('スタッフは自分の申請を「承認」にできない',
  $$update public.requests set status = 'approved' where kind = 'pl'$$, 'not_allowed');
select test.fails('スタッフは申請の日付を書き換えられない',
  $$update public.requests set work_date = '2026-12-12' where kind = 'pl'$$, 'not_allowed');
select test.fails('スタッフは他人の名前で申請できない',
  $$insert into public.requests (store_id, staff_id, kind, work_date, status) values (current_setting('test.store_a')::uuid, (select id from public.staff where name = '田中'), 'pl', '2026-12-13', 'pending')$$, 'not_allowed');
update public.requests set status = 'canceled' where kind = 'pl';
select test.ok('スタッフは自分の申請を取り消せる', (select status from public.requests where kind = 'pl') = 'canceled');

\echo
\echo '== 8. シフト交代 =='
insert into public.requests (store_id, staff_id, kind, work_date, status, shift_type_id)
  values (current_setting('test.store_a')::uuid, public.my_staff_id(current_setting('test.store_a')::uuid), 'swap', '2026-11-20', 'open',
          (select id from public.shift_types where name = '日勤'));
select set_config('test.swap', (select id::text from public.requests where kind = 'swap'), false);
select test.fails('自分の交代募集は引き受けられない', $$select public.take_swap(current_setting('test.swap')::uuid)$$, 'not_allowed');
select test.login('c0000000-0000-0000-0000-000000000002');
select test.fails('その日に出勤予定の人は引き受けられない', $$select public.take_swap(current_setting('test.swap')::uuid)$$, 'busy');
reset role;
update public.shift_assignments set shift_type_id = (select id from public.shift_types where name = '休み')
  where staff_id = (select id from public.staff where name = '伊藤') and work_date = '2026-11-20';
set role authenticated;
select public.take_swap(current_setting('test.swap')::uuid);
select test.ok('別のスタッフが引き受けると承認待ちになる',
  (select status = 'pending' and taker_staff_id = (select id from public.staff where name = '伊藤') from public.requests where id = current_setting('test.swap')::uuid));
select test.fails('引き受けた人も、自分で承認にはできない',
  $$update public.requests set status = 'approved' where id = current_setting('test.swap')::uuid$$, 'not_allowed');
select test.login('b0000000-0000-0000-0000-000000000001');
select test.ok('他店の店長は店Aの申請を読めない', test.n('select * from public.requests') = 0);
select test.login('a0000000-0000-0000-0000-000000000001');
update public.requests set status = 'approved' where id = current_setting('test.swap')::uuid;
select test.ok('店長は承認でき、承認した人と日時が残る',
  (select status = 'approved' and decided_by = 'a0000000-0000-0000-0000-000000000001' and decided_at is not null
   from public.requests where id = current_setting('test.swap')::uuid));

\echo
\echo '== 9. 実効プランは日付で決まる =='
select test.login('d0000000-0000-0000-0000-000000000001');
select public.ops_set_plan(current_setting('test.store_a')::uuid, 'free', 'trialing', 'テスト：トライアル終了日を過去に',
  p_trial_ends_at => current_date - 1);
select test.ok('トライアル終了日を過ぎると、何もしなくてもフリーになる', public.effective_plan(current_setting('test.store_a')::uuid) = 'free');
select public.ops_set_plan(current_setting('test.store_a')::uuid, 'standard', 'active', '入金確認', p_billing_cycle => 'month');
select test.ok('契約中（期間の終わりが空欄）はそのプラン', public.effective_plan(current_setting('test.store_a')::uuid) = 'standard');
select public.ops_set_plan(current_setting('test.store_a')::uuid, 'standard', 'canceling', '解約の連絡', p_current_period_end => current_date + 10);
select test.ok('解約予定でも期間の終わりまではそのプラン', public.effective_plan(current_setting('test.store_a')::uuid) = 'standard');
select public.ops_set_plan(current_setting('test.store_a')::uuid, 'standard', 'canceling', 'テスト：期間の終わりを過去に', p_current_period_end => current_date - 1);
select test.ok('期間の終わりを過ぎるとフリーになる', public.effective_plan(current_setting('test.store_a')::uuid) = 'free');
select test.ok('運営者は全店の契約を読める', test.n('select * from public.subscriptions') = 2);
select test.ok('運営者は変更履歴を読める', test.n('select * from public.plan_events') >= 6);
select test.ok('運営者でも各店のスタッフや時給は読めない（必要になるまで開かない）',
  test.n('select * from public.staff') = 0 and test.n('select * from public.staff_private') = 0);

\echo
\echo '== 10. ログイン前の人 =='
reset role;
select set_config('request.jwt.claims', '', false);
set role anon;
select test.fails('ログイン前は店舗を読めない', $$select * from public.stores$$, 'permission denied');
select test.fails('ログイン前は関数を呼べない', $$select public.effective_plan(gen_random_uuid())$$, 'permission denied');
select test.ok('ログイン前でも、公開済みのお知らせは読める（下書きは見えない）', test.n('select * from public.app_updates') = 1);
reset role;

\echo
\echo 'すべてのテストに合格しました'
