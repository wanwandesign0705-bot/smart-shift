-- テスト専用：素の PostgreSQL で Supabase の仕組みを真似する（本番の Supabase には流さない）
--   ・ロール anon（ログイン前）／authenticated（ログイン後）／service_role（サーバー）
--   ・auth.users と auth.uid() / auth.jwt()（Supabase と同じく request.jwt.claims から読む）
--   ・extensions スキーマ（pgcrypto の置き場）
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
