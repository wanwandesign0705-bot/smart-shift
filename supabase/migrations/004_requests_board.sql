-- =====================================================================
-- 004：申請と交代の見え方（作業6）
-- すでに schema.sql を流した Supabase に、002・003 のあとで追加で流す（2回流しても大丈夫）。
-- 新しく作る場合は schema.sql に入っているので、流さなくてよい。
--
-- スタッフが申請の表から読めるのは「自分の申請」だけにする（理由はほかの人に見せない）。
-- 交代の募集と、引き受けた交代は、swap_board 関数で「日付・時間帯・相手の名前・状態」だけを返す。
-- =====================================================================

drop policy if exists requests_read on public.requests;
create policy requests_read on public.requests for select to authenticated
  using (public.is_store_admin(store_id) or staff_id = public.my_staff_id(store_id));

-- 交代の掲示板。ログイン中のスタッフに、次の3種類だけを返す（申請の理由は返さない）
--   open      ：ほかの人が募集中の交代（募集した人の名前）
--   taken     ：自分が引き受けた交代（募集した人の名前と状態）
--   mine      ：自分が募集した交代（引き受けた人の名前と状態）
drop function if exists public.swap_board(uuid);
create function public.swap_board(p_store uuid)
returns table (request_id uuid, relation text, work_date date, shift_name text, shift_time text,
               status text, other_staff_id uuid, other_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with me as (select public.my_staff_id(p_store) as id)
  select r.id,
         case when r.staff_id = me.id then 'mine' when r.taker_staff_id = me.id then 'taken' else 'open' end,
         r.work_date, t.name, t.time_range, r.status,
         case when r.staff_id = me.id then r.taker_staff_id else r.staff_id end,
         case when r.staff_id = me.id then tk.name else rq.name end,
         r.created_at
  from public.requests r
  cross join me
  left join public.shift_types t on t.id = r.shift_type_id
  left join public.staff rq on rq.id = r.staff_id
  left join public.staff tk on tk.id = r.taker_staff_id
  where me.id is not null and r.store_id = p_store and r.kind = 'swap'
    and ((r.status = 'open' and r.staff_id <> me.id and r.work_date >= current_date)
         or r.taker_staff_id = me.id
         or r.staff_id = me.id)
  order by r.work_date
$$;

revoke execute on function public.swap_board(uuid) from public, anon;
grant execute on function public.swap_board(uuid) to authenticated;
