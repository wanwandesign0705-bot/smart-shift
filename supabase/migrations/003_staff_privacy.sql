-- =====================================================================
-- 003：スタッフから見える範囲を、本人の分だけに狭める（作業5の修正）
-- すでに schema.sql を流した Supabase に、これだけを追加で流す（2回流しても大丈夫）。
-- 新しく作る場合は schema.sql に入っているので、流さなくてよい。
--
-- 直す前：スタッフは、同じお店の全員の名簿（入社日・扶養・学生など）、全員の公開済みシフト、
--         全員の申請（理由を含む）を読めた。
-- 直した後：名簿は自分の1行だけ、シフトは自分の公開済みの分だけ、
--         申請は自分のもの・自分が引き受けたもの・交代の募集中のものだけ。店長は今までどおり全部読める。
-- =====================================================================

-- 名簿：店長は staff_write（読み書き）で全部読める。スタッフは自分の1行だけ
drop policy if exists staff_read on public.staff;
drop policy if exists staff_read_self on public.staff;
create policy staff_read_self on public.staff for select to authenticated
  using (user_id = auth.uid());

-- シフト：スタッフは、自分の分で、公開済みの期間だけ
drop policy if exists assignments_staff_read on public.shift_assignments;
create policy assignments_staff_read on public.shift_assignments for select to authenticated
  using (staff_id = public.my_staff_id(store_id) and public.is_published(store_id, work_date));

-- 申請：店長は全部。スタッフは自分のもの・自分が引き受けたもの・交代の募集中のもの
drop policy if exists requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated
  using (public.is_store_admin(store_id)
         or staff_id = public.my_staff_id(store_id)
         or taker_staff_id = public.my_staff_id(store_id)
         or (kind = 'swap' and status = 'open' and public.my_staff_id(store_id) is not null));
