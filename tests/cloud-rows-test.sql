-- アプリが Supabase に送る操作（:ops）を、店長の権限で schema.sql の DB に流す。
-- そのあと、スタッフの権限で「公開した期間だけ見える」「時給は見えない」ことを確かめる。
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
create schema test;
grant usage on schema test to authenticated;
create function test.ok(p_name text, p_cond boolean) returns void language plpgsql as $$
begin if p_cond is not true then raise exception 'FAIL: %', p_name; end if; raise notice 'PASS: %', p_name; end $$;
-- PostgREST と同じ意味で1つの操作を流す（呼んだ人の権限で動く）
create function test.apply(p_store uuid, o jsonb) returns void language plpgsql as $$
declare t text := o ->> 'table'; cols text; sets text; pk text;
begin
  pk := case t when 'shift_assignments' then 'staff_id, work_date' when 'staff_private' then 'staff_id' else 'id' end;
  if o ->> 'op' = 'upsert' then
    select string_agg(quote_ident(k), ', '), string_agg(format('%1$I = excluded.%1$I', k), ', ') filter (where k <> all (string_to_array(replace(pk, ' ', ''), ',')))
      into cols, sets from jsonb_object_keys(o -> 'rows' -> 0) k;
    execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%s) do update set %s',
                   t, cols, cols, t, pk, sets) using o -> 'rows';
  elsif o ->> 'op' = 'delete' then
    execute format('delete from public.%I where store_id = $1 and %I = any (select jsonb_array_elements_text($2)::uuid)',
                   t, case t when 'staff_private' then 'staff_id' else 'id' end) using p_store, o -> 'ids';
  elsif o ->> 'op' = 'deleteCells' then
    delete from public.shift_assignments a using jsonb_to_recordset(o -> 'rows') x(staff_id uuid, work_date date)
      where a.store_id = p_store and a.staff_id = x.staff_id and a.work_date = x.work_date;
  elsif o ->> 'op' = 'update' then
    select string_agg(format('%1$I = r.%1$I', k), ', ') into sets from jsonb_object_keys(o -> 'row') k;
    execute format('update public.%I x set %s from jsonb_populate_record(null::public.%I, $1) r where x.%I = $2',
                   t, sets, t, case t when 'stores' then 'id' else 'store_id' end) using o -> 'row', p_store;
  elsif o ->> 'op' = 'replace' then
    delete from public.shift_publications where store_id = p_store;
    if jsonb_typeof(o -> 'row') = 'object' then
      insert into public.shift_publications (store_id, start_date, end_date)
        values (p_store, (o -> 'row' ->> 'start_date')::date, (o -> 'row' ->> 'end_date')::date);
    end if;
  end if;
end $$;
grant execute on all functions in schema test to authenticated;

insert into auth.users (id, email, is_anonymous) values
  ('a0000000-0000-0000-0000-0000000000aa', 'tencho@example.com', false),
  ('c0000000-0000-0000-0000-0000000000cc', null, true);
create temp table ops as select :'ops'::jsonb as j;
grant select on ops to authenticated;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000aa","role":"authenticated","is_anonymous":false}', false);
insert into public.consents (user_id, document, version) values
  ('a0000000-0000-0000-0000-0000000000aa', 'terms', 'v'), ('a0000000-0000-0000-0000-0000000000aa', 'privacy', 'v');
select set_config('test.sid', public.create_store('テスト店')::text, false);
create temp table plan as select replace(j::text, '00000000-0000-4000-8000-0000000000ff', current_setting('test.sid'))::jsonb as j from ops;

\echo '== 1回目：お店を開いた直後の保存 =='
select test.apply(current_setting('test.sid')::uuid, o) from plan, jsonb_array_elements(plan.j -> 'first') o;
select test.ok('店長の権限で、すべての操作が通る', true);
select test.ok('シフトの行数が、アプリで作った数と同じ',
  (select count(*) from public.shift_assignments) = (select (j -> 'counts' ->> 'cells1')::int from plan));
select test.ok('有給（全日・半日）・希望休・メモが入る',
  (select count(*) filter (where leave = 'full') = 1 and count(*) filter (where leave = 'half') = 1
          and count(*) filter (where wish_off) = 1 and count(*) filter (where memo = '10時出勤') = 1 from public.shift_assignments));
select test.ok('設定（必要人数・巡回パターン）が入る',
  (select need[6] = 5 and array_length(patterns, 1) = 1 from public.store_settings));
select test.ok('公開した期間が入る', (select end_date = '2026-11-15' from public.shift_publications));

\echo '== 2回目：変更の差分 =='
select test.apply(current_setting('test.sid')::uuid, o) from plan, jsonb_array_elements(plan.j -> 'second') o;
select test.ok('消したスタッフと、そのシフト・時給が消える',
  not exists (select 1 from public.staff where id = (select (j ->> 'gone')::uuid from plan))
  and not exists (select 1 from public.shift_assignments where staff_id = (select (j ->> 'gone')::uuid from plan))
  and not exists (select 1 from public.staff_private where staff_id = (select (j ->> 'gone')::uuid from plan)));
select test.ok('名簿・区分・シフトの数が、アプリと同じ',
  (select count(*) from public.staff) = (select (j -> 'counts' ->> 'staff2')::int from plan)
  and (select count(*) from public.shift_types) = (select (j -> 'counts' ->> 'types2')::int from plan)
  and (select count(*) from public.shift_assignments) = (select (j -> 'counts' ->> 'cells2')::int from plan));

\echo '== スタッフから見えるもの =='
select set_config('test.tok', public.create_invite((select id from public.staff order by sort_order limit 1)), false);
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-0000-0000-0000000000cc","role":"authenticated","is_anonymous":true}', false);
select public.redeem_invite(current_setting('test.tok'));
select test.ok('スタッフは、公開した11月15日までのシフトだけ読める',
  (select count(*) > 0 and max(work_date) <= '2026-11-15' from public.shift_assignments));
select test.ok('スタッフは時給を読めない', (select count(*) = 0 from public.staff_private));
select test.ok('スタッフは店の設定（予算）を読めない', (select count(*) = 0 from public.store_settings));
select test.ok('スタッフはシフト区分と名簿は読める', (select count(*) > 0 from public.shift_types) and (select count(*) > 0 from public.staff));
reset role;
\echo 'アプリが送る操作は、すべて守りのある DB で正しく動きました'
