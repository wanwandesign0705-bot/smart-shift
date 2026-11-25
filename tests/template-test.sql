-- アプリが作る業種テンプレートの行（:rows）を、店長として新しいお店に入れられるか確かめる。
-- 8業種それぞれでお店を作り、シフト区分・スタッフ・時給・設定を、アプリと同じ順番で入れる。
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-0000000000aa', 'tencho@example.com');
create temp table tpl as select t.v as tdata from jsonb_array_elements(:'rows'::jsonb) t(v);
grant select on tpl to authenticated;
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000aa","role":"authenticated","is_anonymous":false}', false);
insert into public.consents (user_id, document, version) values
  ('a0000000-0000-0000-0000-0000000000aa', 'terms', '2026-11-17'), ('a0000000-0000-0000-0000-0000000000aa', 'privacy', '2026-11-17');
do $$
declare r record; sid uuid; j jsonb; n_st int; n_sf int;
begin
  for r in select tdata from tpl loop
    sid := public.create_store('テスト店', r.tdata ->> 'industry', null);
    j := replace(r.tdata::text, '00000000-0000-4000-8000-0000000000ff', sid::text)::jsonb;
    insert into public.shift_types select * from jsonb_populate_recordset(null::public.shift_types, j -> 'shiftTypes');
    insert into public.staff (id, store_id, name, role, work_mode, fixed_days, hire_date, work_days, pl_hours, fuyo_limit, is_student, long_term, sort_order)
      select id, store_id, name, role, work_mode, fixed_days, hire_date, work_days, pl_hours, fuyo_limit, is_student, long_term, sort_order
      from jsonb_populate_recordset(null::public.staff, j -> 'staff');
    insert into public.staff_private (staff_id, store_id, wage)
      select staff_id, store_id, wage from jsonb_populate_recordset(null::public.staff_private, j -> 'wages');
    update public.store_settings set
      need = array(select jsonb_array_elements_text(j -> 'settings' -> 'need'))::smallint[],
      bonus = j -> 'settings' -> 'bonus',
      patterns = array(select jsonb_array_elements_text(j -> 'settings' -> 'patterns'))
    where store_id = sid;
    select count(*) into n_st from public.shift_types where store_id = sid;
    select count(*) into n_sf from public.staff_private where store_id = sid;
    if n_st <> jsonb_array_length(j -> 'shiftTypes') or n_sf <> jsonb_array_length(j -> 'staff') then
      raise exception 'FAIL: % の行数が合いません', r.tdata ->> 'industry';
    end if;
    if exists (select 1 from public.staff s, jsonb_each_text(s.fixed_days) f
               where s.store_id = sid and not exists (select 1 from public.shift_types t where t.id = f.value::uuid and t.store_id = sid)) then
      raise exception 'FAIL: % の固定曜日が、存在しないシフト区分を指しています', r.tdata ->> 'industry';
    end if;
    raise notice 'PASS: %（シフト区分 % ・スタッフ % 人）', r.tdata ->> 'industry', n_st, n_sf;
  end loop;
end $$;
reset role;
\echo 'すべての業種テンプレートを入れられました'
