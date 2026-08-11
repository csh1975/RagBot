-- 001_create_profiles_table.sql
-- 프로필 테이블: 사용자 역할(admin/user) 관리

create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS 활성화
alter table public.profiles enable row level security;

-- 정책: 본인 프로필 조회 가능
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

-- 정책: 본인 프로필 수정 가능
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- 정책: 관리자는 모든 프로필 조회 가능
create policy "Admins can view all profiles" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- 트리거: 회원가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'user');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- updated_at 자동 갱신 트리거
create or replace function public.handle_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end $$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();
