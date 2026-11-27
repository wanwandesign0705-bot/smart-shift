-- =====================================================================
-- 002：スタッフ本人の時給だけを返す関数（作業5）
-- すでに schema.sql を流した Supabase に、これだけを追加で流す。
-- 新しく作る場合は schema.sql に入っているので、流さなくてよい。
-- =====================================================================

-- スタッフ画面の「給与見込」に使う。時給の表（staff_private）は店長しか読めないので、
-- ログイン中のスタッフ本人の時給だけを、この関数で返す。本人でなければ null。
create or replace function public.my_wage(p_store uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select p.wage from public.staff_private p where p.staff_id = public.my_staff_id(p_store)
$$;

revoke execute on function public.my_wage(uuid) from public, anon;
grant execute on function public.my_wage(uuid) to authenticated;
