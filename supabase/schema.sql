-- =====================================================================
-- Smart Shift  データベース定義（Supabase / PostgreSQL 16）
--
-- 設計書「Smart Shift Manager 本番版 設計書」の「DB設計」「認証と権限」にもとづく。
-- 新しい Supabase プロジェクトの SQL エディタに、このファイルを丸ごと貼って1回実行する。
--
-- 守りの考え方
--   ・業務データの行はすべて store_id（店舗ID）を持ち、行単位のアクセス制御（RLS）で
--     「その店の管理者か」「その店のスタッフ本人か」を確かめてから読み書きさせる
--   ・時給は staff_private に分け、スタッフからは読めない
--   ・契約（プラン）は運営者だけが ops_set_plan 関数で変えられ、変更の前後が plan_events に残る
--   ・実効プランは日付で決まる（effective_plan）。定期実行の仕組みはいらない
--   ・匿名ログイン（スタッフの招待リンク）の人は、招待で結びついた店のデータしか読めない
--
-- 確認：tests/ の schema-test.sql で、設計書の「確かめたこと」をすべてテストしている
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. テーブル（20個）
-- ---------------------------------------------------------------------

-- 店舗
create table public.stores (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 1 and 100),
  industry         text not null default '',
  company_size     text check (company_size in ('small', 'large')),   -- 会社全体の従業員数（未設定は null）
  request_deadline smallint not null default 20 check (request_deadline between 1 and 28), -- 希望休・有給の提出締切日
  created_at       timestamptz not null default now()
);

-- 店舗と管理者（店長）の紐づけ
create table public.store_members (
  store_id   uuid not null references public.stores(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'manager')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

-- 店舗の設定（スタッフは読めない。予算を含むため）
create table public.store_settings (
  store_id   uuid primary key references public.stores(id) on delete cascade,
  span       text not null default 'm1' check (span in ('w1', 'w2', 'w3', 'm1')),
  need       smallint[] not null default '{3,3,3,3,3,3,3}',               -- 曜日ごとの必要人数（日〜土）
  bonus      jsonb not null default '{"fri":0,"sat":0,"end":0}',          -- 繁忙加算
  patterns   text[] not null default '{}',                               -- 巡回パターン
  budget     integer not null default 0 check (budget >= 0),             -- 月間人件費予算（円）
  rules      jsonb not null default '{"maxRun":6,"interval":11}',        -- 連勤上限・勤務間インターバル
  updated_at timestamptz not null default now()
);

-- シフト区分
create table public.shift_types (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  time_range  text not null default '',                 -- 例 '09:00-18:00'、'22:00-翌06:00'
  color       text not null default '#F1F5F9',
  min_staff   smallint not null default 0 check (min_staff >= 0),
  break_hours numeric(4, 2),                            -- null は法定休憩を自動で差し引く
  next_day_off boolean not null default false,          -- 明け休み
  is_off      boolean not null default false,           -- 「休み」の区分
  sort_order  smallint not null default 0
);
create index on public.shift_types (store_id);

-- スタッフ名簿（スタッフも同じ店の名簿は読める。時給はここに置かない）
create table public.staff (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  name         text not null,
  role         text not null default '',
  work_mode    text not null default '',                -- '' 自由／'w' 固定曜日／'0','1'… 巡回パターン番号
  fixed_days   jsonb not null default '{}',             -- 固定曜日の区分 {"1": "<shift_type_id>", ...}
  hire_date    date,
  work_days    smallint not null default 5 check (work_days between 1 and 5),  -- 週の所定労働日数
  pl_hours     numeric(4, 2) not null default 8,        -- 有給1日の時間
  fuyo_limit   integer not null default 0,              -- 扶養ライン（円。0 は設定なし）
  is_student   boolean not null default false,
  long_term    boolean not null default true,           -- 2ヶ月を超える雇用見込み
  user_id      uuid unique references auth.users(id) on delete set null,  -- 招待で結びついたログイン
  active       boolean not null default true,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.staff (store_id);

-- 時給・個人メモ（管理者だけが読める）
create table public.staff_private (
  staff_id uuid primary key references public.staff(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  wage     integer not null default 0 check (wage >= 0),
  memo     text not null default ''
);
create index on public.staff_private (store_id);

-- 招待リンク（トークンそのものは保存しない。ハッシュだけ）
create table public.staff_invites (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  used_at    timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.staff_invites (store_id);

-- 1人1日のシフトとメモ
create table public.shift_assignments (
  store_id      uuid not null references public.stores(id) on delete cascade,
  staff_id      uuid not null references public.staff(id) on delete cascade,
  work_date     date not null,
  shift_type_id uuid references public.shift_types(id) on delete set null,
  leave         text check (leave in ('full', 'half')),  -- 有給（全日／半日）
  wish_off      boolean not null default false,          -- 希望休（自動作成で休みに固定）
  memo          text not null default '',
  updated_at    timestamptz not null default now(),
  primary key (staff_id, work_date)
);
create index on public.shift_assignments (store_id, work_date);

-- 公開した期間（スタッフはこの期間のシフトだけ読める）
create table public.shift_publications (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references public.stores(id) on delete cascade,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null
);
create index on public.shift_publications (store_id, start_date, end_date);

-- 有給・希望休・交代の申請
create table public.requests (
  id             uuid primary key default gen_random_uuid(),
  store_id       uuid not null references public.stores(id) on delete cascade,
  staff_id       uuid not null references public.staff(id) on delete cascade,
  kind           text not null check (kind in ('pl', 'off', 'swap')),
  work_date      date not null,
  half_day       boolean not null default false,
  shift_type_id  uuid references public.shift_types(id) on delete set null,  -- 交代するシフト
  reason         text not null default '' check (length(reason) <= 500),
  status         text not null check (status in ('pending', 'open', 'approved', 'rejected', 'canceled')),
  taker_staff_id uuid references public.staff(id) on delete set null,        -- 交代を引き受けた人
  note           text not null default '',                                   -- 管理者からのひとこと
  created_at     timestamptz not null default now(),
  taken_at       timestamptz,
  decided_at     timestamptz,
  decided_by     uuid references auth.users(id) on delete set null
);
create index on public.requests (store_id, status);

-- 有給の付与（取得日数は承認済みの申請・シフトから数える）
create table public.paid_leave_grants (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  grant_date date not null,
  days       numeric(4, 1) not null check (days >= 0),
  carryover  numeric(4, 1) not null default 0,         -- 前年度の繰越・調整
  note       text not null default '',
  unique (staff_id, grant_date)
);
create index on public.paid_leave_grants (store_id);

-- 社内連絡と既読
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  title      text not null check (length(title) between 1 and 200),
  body       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index on public.announcements (store_id, created_at desc);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  staff_id        uuid not null references public.staff(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, staff_id)
);

-- 予約
create table public.reservations (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.stores(id) on delete cascade,
  res_date   date not null,
  res_time   time not null default '18:00',
  guest_name text not null,
  party_size smallint not null default 1 check (party_size > 0),
  note       text not null default ''
);
create index on public.reservations (store_id, res_date);

-- 契約（店長は読むだけ。書き換えは ops_set_plan だけ）
create table public.subscriptions (
  store_id               uuid primary key references public.stores(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free', 'standard', 'pro')),
  status                 text not null default 'trialing'
                         check (status in ('trialing', 'active', 'canceling', 'canceled', 'past_due')),
  billing_cycle          text check (billing_cycle in ('month', 'year')),
  trial_ends_at          date not null,
  current_period_end     date,          -- 契約中は空欄。解約予定のときだけ Stripe の解約日を入れる
  stripe_customer_id     text,
  stripe_subscription_id text,
  founding_member        boolean not null default false,
  updated_at             timestamptz not null default now()
);

-- プラン変更の履歴（運営者だけが読める）
create table public.plan_events (
  id         bigint generated always as identity primary key,
  store_id   uuid not null references public.stores(id) on delete cascade,
  actor      uuid references auth.users(id) on delete set null,
  reason     text not null,
  before     jsonb,
  after      jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.plan_events (store_id, created_at desc);

-- 規約・プライバシーポリシーへの同意と版
create table public.consents (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  document  text not null check (document in ('terms', 'privacy')),
  version   text not null,
  agreed_at timestamptz not null default now()
);
create index on public.consents (user_id);

-- 運営からのお知らせ（メンテナンス・今後の予定・更新履歴）
create table public.app_updates (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('maintenance', 'roadmap', 'release')),
  title      text not null,
  body       text not null default '',
  version    text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

-- 決済リンクなどの設定（運営者だけが書ける）
create table public.app_config (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- 運営者の一覧（登録は SQL エディタから手で行う）
create table public.platform_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. 権限を判定する関数
--    security definer：RLS の中から呼んでも、判定に使う表を読めるようにする
-- ---------------------------------------------------------------------

-- 匿名ログイン（招待リンクのスタッフ）かどうか
create function public.is_anonymous_user() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- その店の管理者か（匿名ログインの人は管理者になれない）
create function public.is_store_admin(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not public.is_anonymous_user()
     and exists (select 1 from public.store_members where store_id = p_store and user_id = auth.uid())
$$;

-- ログイン中の人が、その店のどのスタッフか（スタッフでなければ null）
create function public.my_staff_id(p_store uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.staff where store_id = p_store and user_id = auth.uid() and active
$$;

-- その店の人か（管理者またはスタッフ本人）
create function public.is_store_user(p_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_store_admin(p_store) or public.my_staff_id(p_store) is not null
$$;

-- その日が公開済みの期間に入っているか
create function public.is_published(p_store uuid, p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shift_publications
                 where store_id = p_store and p_date between start_date and end_date)
$$;

-- スタッフ本人の時給だけを返す（スタッフ画面の給与見込に使う。本人でなければ null）
create function public.my_wage(p_store uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select p.wage from public.staff_private p where p.staff_id = public.my_staff_id(p_store)
$$;

-- ---------------------------------------------------------------------
-- 3. プラン
-- ---------------------------------------------------------------------

-- 実効プラン：トライアル中はプロ。トライアル終了日・有料期間の終わりを過ぎたらフリー
create function public.effective_plan(p_store uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    -- 他店の人には答えない（auth.uid() が空なのは SQL エディタやサーバーからの呼び出し）
    when auth.uid() is not null and not (public.is_store_user(p_store) or public.is_platform_admin()) then null
    when s.status = 'trialing' then
      case when s.trial_ends_at >= current_date then 'pro' else 'free' end
    when s.plan in ('standard', 'pro')
         and s.status in ('active', 'canceling', 'past_due')
         and (s.current_period_end is null or s.current_period_end >= current_date) then s.plan
    else 'free'
  end
  from public.subscriptions s where s.store_id = p_store
$$;

-- プランごとのスタッフ上限（プロの100名は未決定の案。変えるならここだけ）
create function public.staff_limit(p_plan text) returns integer
language sql immutable set search_path = '' as $$
  select case p_plan when 'standard' then 30 when 'pro' then 100 else 5 end
$$;

-- スタッフの登録・再有効化で上限を超えたら止める
create function public.check_staff_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_plan  text;
  v_count integer;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active then return new; end if;
  select case
    when s.status = 'trialing' then case when s.trial_ends_at >= current_date then 'pro' else 'free' end
    when s.plan in ('standard', 'pro') and s.status in ('active', 'canceling', 'past_due')
         and (s.current_period_end is null or s.current_period_end >= current_date) then s.plan
    else 'free' end
    into v_plan
    from public.subscriptions s where s.store_id = new.store_id;
  select count(*) into v_count from public.staff
   where store_id = new.store_id and active and id <> new.id;
  if v_count >= public.staff_limit(coalesce(v_plan, 'free')) then
    raise exception 'staff_limit_exceeded: % プランのスタッフ上限は % 名です', coalesce(v_plan, 'free'),
      public.staff_limit(coalesce(v_plan, 'free'))
      using errcode = 'P0001', hint = 'プランを変更するか、スタッフを減らしてください';
  end if;
  return new;
end $$;

create trigger staff_limit_check before insert or update of active on public.staff
  for each row execute function public.check_staff_limit();

-- ---------------------------------------------------------------------
-- 4. 店舗の作成（新規登録の最後に店長が呼ぶ）
--    規約とプライバシーポリシーへの同意がないと作れない。2ヶ月のトライアルが自動で始まる
-- ---------------------------------------------------------------------
create function public.create_store(p_name text, p_industry text default '', p_company_size text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_uid   uuid := auth.uid();
begin
  if v_uid is null or public.is_anonymous_user() then
    raise exception 'not_allowed: 店舗を作れるのは、メールで登録した店長だけです' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consents where user_id = v_uid and document = 'terms')
     or not exists (select 1 from public.consents where user_id = v_uid and document = 'privacy') then
    raise exception 'consent_required: 利用規約とプライバシーポリシーへの同意が必要です' using errcode = 'P0001';
  end if;

  insert into public.stores (name, industry, company_size) values (p_name, coalesce(p_industry, ''), p_company_size)
    returning id into v_store;
  insert into public.store_members (store_id, user_id, role) values (v_store, v_uid, 'owner');
  insert into public.store_settings (store_id) values (v_store);
  insert into public.subscriptions (store_id, plan, status, trial_ends_at)
    values (v_store, 'free', 'trialing', (current_date + interval '2 months')::date);
  insert into public.plan_events (store_id, actor, reason, before, after)
    values (v_store, v_uid, '店舗作成（トライアル開始）', null,
            jsonb_build_object('plan', 'free', 'status', 'trialing',
                               'trial_ends_at', (current_date + interval '2 months')::date));
  return v_store;
end $$;

-- ---------------------------------------------------------------------
-- 5. 運営者がプランを変える（/ops 画面から呼ぶ。理由は必須）
-- ---------------------------------------------------------------------
create function public.ops_set_plan(
  p_store                  uuid,
  p_plan                   text,
  p_status                 text,
  p_reason                 text,
  p_billing_cycle          text    default null,
  p_current_period_end     date    default null,
  p_trial_ends_at          date    default null,
  p_stripe_customer_id     text    default null,
  p_stripe_subscription_id text    default null,
  p_founding_member        boolean default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not_allowed: プランを変えられるのは運営者だけです' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required: 変更の理由を入れてください' using errcode = 'P0001';
  end if;

  select to_jsonb(s) - 'updated_at' into v_before from public.subscriptions s where store_id = p_store for update;
  if v_before is null then
    raise exception 'not_found: 店舗が見つかりません' using errcode = 'P0002';
  end if;

  update public.subscriptions set
    plan                   = p_plan,
    status                 = p_status,
    billing_cycle          = coalesce(p_billing_cycle, billing_cycle),
    current_period_end     = p_current_period_end,          -- 契約中は空欄にする運用なので、そのまま入れる
    trial_ends_at          = coalesce(p_trial_ends_at, trial_ends_at),
    stripe_customer_id     = coalesce(p_stripe_customer_id, stripe_customer_id),
    stripe_subscription_id = coalesce(p_stripe_subscription_id, stripe_subscription_id),
    founding_member        = coalesce(p_founding_member, founding_member),
    updated_at             = now()
  where store_id = p_store;

  select to_jsonb(s) - 'updated_at' into v_after from public.subscriptions s where store_id = p_store;
  insert into public.plan_events (store_id, actor, reason, before, after)
    values (p_store, auth.uid(), p_reason, v_before, v_after);
end $$;

-- ---------------------------------------------------------------------
-- 6. 招待リンク
-- ---------------------------------------------------------------------

-- 管理者が発行する。戻り値のトークンは1回だけ表示し、DB にはハッシュだけを残す
create function public.create_invite(p_staff uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select store_id into v_store from public.staff where id = p_staff;
  if v_store is null or not public.is_store_admin(v_store) then
    raise exception 'not_allowed: この店のスタッフではありません' using errcode = '42501';
  end if;
  -- 古い未使用のリンクは使えなくする
  update public.staff_invites set used_at = now() where staff_id = p_staff and used_at is null;
  insert into public.staff_invites (store_id, staff_id, token_hash, created_by)
    values (v_store, p_staff, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end $$;

-- スタッフが開いたとき（Edge Function「redeem-invite」から呼ぶ）。リンクは1回で使えなくなる
create function public.redeem_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.staff_invites;
begin
  if auth.uid() is null then
    raise exception 'not_allowed: ログインが必要です' using errcode = '42501';
  end if;
  select * into v_inv from public.staff_invites
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and used_at is null and expires_at > now()
   for update;
  if v_inv.id is null then
    raise exception 'invalid_invite: 招待リンクが無効か、期限切れです。店長に再発行を頼んでください' using errcode = 'P0001';
  end if;
  -- この端末を、前に結びついていた別のスタッフから外し、新しいスタッフに結びつける
  update public.staff set user_id = null where user_id = auth.uid();
  update public.staff set user_id = auth.uid() where id = v_inv.staff_id;
  update public.staff_invites set used_at = now() where id = v_inv.id;
  return v_inv.staff_id;
end $$;

-- ---------------------------------------------------------------------
-- 7. 申請
-- ---------------------------------------------------------------------

-- スタッフが出す申請は「承認待ち」か「交代募集中」だけ。勝手に承認済みにはできない
create function public.guard_requests() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- take_swap 関数の中からの更新は、関数側で確かめ済みなので通す
  if current_setting('smartshift.trusted_write', true) = 'on' then
    return new;
  end if;
  -- 管理者、または SQL エディタ・サーバーからの操作（ログインした人がいない）
  if public.is_store_admin(coalesce(new.store_id, old.store_id)) or auth.uid() is null then
    if new.status in ('approved', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      new.decided_at := now();
      new.decided_by := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.staff_id is distinct from public.my_staff_id(new.store_id) then
      raise exception 'not_allowed: 自分の申請だけ出せます' using errcode = '42501';
    end if;
    if new.status <> (case when new.kind = 'swap' then 'open' else 'pending' end) then
      raise exception 'not_allowed: 申請は承認待ち（交代は募集中）で出してください' using errcode = '42501';
    end if;
    new.taker_staff_id := null; new.note := ''; new.decided_at := null; new.decided_by := null; new.taken_at := null;
    new.created_at := now();
    return new;
  end if;

  -- スタッフができる更新は、自分の申請の取り消しだけ（交代の引き受けは take_swap で）
  if old.staff_id = public.my_staff_id(old.store_id)
     and old.status in ('pending', 'open') and new.status = 'canceled'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;
  raise exception 'not_allowed: スタッフは自分の申請の取り消ししかできません' using errcode = '42501';
end $$;

create trigger requests_guard before insert or update on public.requests
  for each row execute function public.guard_requests();

-- 交代募集を引き受ける（同じ店の、申請者以外のスタッフ）
create function public.take_swap(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_req public.requests;
  v_me  uuid;
begin
  select * into v_req from public.requests where id = p_request for update;
  if v_req.id is null then
    raise exception 'not_found: 申請が見つかりません' using errcode = 'P0002';
  end if;
  v_me := public.my_staff_id(v_req.store_id);
  if v_me is null then
    raise exception 'not_allowed: この店のスタッフではありません' using errcode = '42501';
  end if;
  if v_req.kind <> 'swap' or v_req.status <> 'open' then
    raise exception 'not_open: この交代はもう募集していません' using errcode = 'P0001';
  end if;
  if v_req.staff_id = v_me then
    raise exception 'not_allowed: 自分の交代募集は引き受けられません' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shift_assignments a left join public.shift_types t on t.id = a.shift_type_id
             where a.staff_id = v_me and a.work_date = v_req.work_date
               and (a.leave is not null or (t.id is not null and not t.is_off))) then
    raise exception 'busy: この日はすでに出勤予定です' using errcode = 'P0001';
  end if;
  perform set_config('smartshift.trusted_write', 'on', true);
  update public.requests set taker_staff_id = v_me, status = 'pending', taken_at = now() where id = p_request;
  perform set_config('smartshift.trusted_write', 'off', true);
end $$;

-- 交代の掲示板。ログイン中のスタッフに、次の3種類だけを返す（申請の理由は返さない）
--   open      ：ほかの人が募集中の交代（募集した人の名前）
--   taken     ：自分が引き受けた交代（募集した人の名前と状態）
--   mine      ：自分が募集した交代（引き受けた人の名前と状態）
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

-- ---------------------------------------------------------------------
-- 8. 行単位のアクセス制御（RLS）
-- ---------------------------------------------------------------------
alter table public.stores             enable row level security;
alter table public.store_members      enable row level security;
alter table public.store_settings     enable row level security;
alter table public.shift_types        enable row level security;
alter table public.staff              enable row level security;
alter table public.staff_private      enable row level security;
alter table public.staff_invites      enable row level security;
alter table public.shift_assignments  enable row level security;
alter table public.shift_publications enable row level security;
alter table public.requests           enable row level security;
alter table public.paid_leave_grants  enable row level security;
alter table public.announcements      enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.reservations       enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.plan_events        enable row level security;
alter table public.consents           enable row level security;
alter table public.app_updates        enable row level security;
alter table public.app_config         enable row level security;
alter table public.platform_admins    enable row level security;

-- 店舗：管理者は読み書き、スタッフは読むだけ。作成は create_store だけ
create policy stores_read   on public.stores for select to authenticated using (public.is_store_user(id));
create policy stores_update on public.stores for update to authenticated
  using (public.is_store_admin(id)) with check (public.is_store_admin(id));

-- 管理者の紐づけ：同じ店の管理者だけ読める。追加は create_store だけ
create policy members_read on public.store_members for select to authenticated using (public.is_store_admin(store_id));

-- 管理者だけのテーブル（設定・時給・招待・予約の書き込み）
create policy settings_admin on public.store_settings for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy private_admin on public.staff_private for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy invites_admin_read on public.staff_invites for select to authenticated using (public.is_store_admin(store_id));
create policy invites_admin_delete on public.staff_invites for delete to authenticated using (public.is_store_admin(store_id));

-- 管理者は読み書き、スタッフは読むだけ
create policy shift_types_read  on public.shift_types for select to authenticated using (public.is_store_user(store_id));
create policy shift_types_write on public.shift_types for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
-- 名簿：店長は staff_write で全部。スタッフは自分の1行だけ（ほかの人の入社日・扶養などは見せない）
create policy staff_read_self on public.staff for select to authenticated using (user_id = auth.uid());
create policy staff_write on public.staff for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy publications_read  on public.shift_publications for select to authenticated using (public.is_store_user(store_id));
create policy publications_write on public.shift_publications for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy reservations_read  on public.reservations for select to authenticated using (public.is_store_user(store_id));
create policy reservations_write on public.reservations for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy announcements_read  on public.announcements for select to authenticated using (public.is_store_user(store_id));
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));

-- シフト：スタッフは、自分の分で、公開済みの期間だけ読める
create policy assignments_admin on public.shift_assignments for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy assignments_staff_read on public.shift_assignments for select to authenticated
  using (staff_id = public.my_staff_id(store_id) and public.is_published(store_id, work_date));

-- 申請：店長は全部。スタッフは自分の申請だけ（理由はほかの人に見せない）。
-- 交代の募集・引き受けた交代は swap_board 関数で必要な項目だけを返す。書き込みの制限は guard_requests トリガー
create policy requests_read on public.requests for select to authenticated
  using (public.is_store_admin(store_id) or staff_id = public.my_staff_id(store_id));
create policy requests_insert on public.requests for insert to authenticated with check (public.is_store_user(store_id));
create policy requests_update on public.requests for update to authenticated
  using (public.is_store_user(store_id)) with check (public.is_store_user(store_id));
create policy requests_delete on public.requests for delete to authenticated using (public.is_store_admin(store_id));

-- 有給の付与：管理者は読み書き、スタッフは自分の分だけ読む
create policy grants_admin on public.paid_leave_grants for all to authenticated
  using (public.is_store_admin(store_id)) with check (public.is_store_admin(store_id));
create policy grants_own on public.paid_leave_grants for select to authenticated
  using (staff_id = public.my_staff_id(store_id));

-- 既読：管理者は読む、スタッフは自分の既読だけ読み書き
create policy reads_admin on public.announcement_reads for select to authenticated using (public.is_store_admin(store_id));
create policy reads_own on public.announcement_reads for all to authenticated
  using (staff_id = public.my_staff_id(store_id)) with check (staff_id = public.my_staff_id(store_id));

-- 契約：管理者は読むだけ。運営者は全店を読める。書き換えは ops_set_plan だけ
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.is_store_admin(store_id) or public.is_platform_admin());
create policy plan_events_read on public.plan_events for select to authenticated using (public.is_platform_admin());
create policy stores_ops_read on public.stores for select to authenticated using (public.is_platform_admin());

-- 同意：本人だけ（取り消しや書き換えはできない）
create policy consents_own_read   on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_own_insert on public.consents for insert to authenticated
  with check (user_id = auth.uid() and not public.is_anonymous_user());

-- 運営からのお知らせ：公開済みは誰でも（ログイン前も）読める。運営者は下書きも読み書き
create policy updates_read_public on public.app_updates for select to anon using (published);
create policy updates_read on public.app_updates for select to authenticated
  using (published or public.is_platform_admin());
create policy updates_ops on public.app_updates for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 決済リンクなど：店長と運営者が読める。書くのは運営者だけ
create policy config_read on public.app_config for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.store_members m where m.user_id = auth.uid()));
create policy config_ops on public.app_config for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- 運営者の一覧：自分が運営者かどうかだけ分かる
create policy admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 9. 誰に何を許すか（RLS の前の大枠）
--    ログイン前（anon）はお知らせを読むことだけ。ログイン後も、関数は必要なものだけ
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.app_updates to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 契約・履歴・運営者の一覧・招待は、表を直接書き換えさせない（関数を通す）
revoke insert, update, delete on public.subscriptions, public.plan_events, public.platform_admins,
  public.store_members, public.staff_invites from authenticated;
grant delete on public.staff_invites to authenticated;
revoke insert, delete on public.stores from authenticated;
revoke update, delete on public.consents from authenticated;

grant execute on function
  public.is_anonymous_user(), public.is_platform_admin(), public.is_store_admin(uuid),
  public.my_staff_id(uuid), public.is_store_user(uuid), public.is_published(uuid, date), public.my_wage(uuid),
  public.effective_plan(uuid), public.staff_limit(text),
  public.create_store(text, text, text),
  public.ops_set_plan(uuid, text, text, text, text, date, date, text, text, boolean),
  public.create_invite(uuid), public.redeem_invite(text), public.take_swap(uuid), public.swap_board(uuid)
  to authenticated;

-- これから作るテーブル・関数にも、勝手に権限が付かないようにする
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. 初期データ（決済リンクの置き場。URL は /ops 画面から入れる）
-- ---------------------------------------------------------------------
insert into public.app_config (key) values
  ('payment_link_standard_month'), ('payment_link_standard_year'),
  ('payment_link_pro_month'), ('payment_link_pro_year'),
  ('customer_portal_url'), ('legal_version');
