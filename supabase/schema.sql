-- Run once in your Supabase SQL editor. No personal reading data is stored in GitHub.
create table if not exists public.library_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.reading_libraries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  data jsonb not null default '{"schema":1,"books":[],"shelves":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.library_owners enable row level security;
alter table public.reading_libraries enable row level security;
-- Access is through authenticated, owner-checked functions only.
revoke all on public.library_owners from anon, authenticated;
revoke all on public.reading_libraries from anon, authenticated;

create or replace function public.load_library() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reading_libraries;
begin
  if auth.uid() is null or not exists (select 1 from public.library_owners where user_id = auth.uid()) then
    raise exception 'Bu hesap kitaplığa erişim yetkisine sahip değil.';
  end if;
  insert into public.reading_libraries(user_id) values (auth.uid()) on conflict do nothing;
  select * into r from public.reading_libraries where user_id = auth.uid();
  return jsonb_build_object('revision', r.revision, 'data', r.data);
end; $$;

create or replace function public.save_library(expected_revision bigint, next_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.reading_libraries;
begin
  if auth.uid() is null or not exists (select 1 from public.library_owners where user_id = auth.uid()) then
    raise exception 'Bu hesap kitaplığa erişim yetkisine sahip değil.';
  end if;
  if next_data->>'schema' is distinct from '1' or jsonb_typeof(next_data->'books') is distinct from 'array' or jsonb_typeof(next_data->'shelves') is distinct from 'array' or octet_length(next_data::text) > 20000000 then
    raise exception 'Geçersiz veya çok büyük kitaplık verisi.';
  end if;
  update public.reading_libraries set data = next_data, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = expected_revision returning * into r;
  if not found then raise exception 'Başka cihazda değişiklik var. Sayfayı yenile ve yeniden dene; kayıtların üzerine yazılmadı.'; end if;
  return jsonb_build_object('revision', r.revision);
end; $$;
revoke all on function public.load_library() from public, anon;
revoke all on function public.save_library(bigint, jsonb) from public, anon;
grant execute on function public.load_library() to authenticated;
grant execute on function public.save_library(bigint, jsonb) to authenticated;
-- After creating your user in Authentication > Users, add its UUID:
-- insert into public.library_owners(user_id) values ('YOUR-USER-UUID');
