-- 008_fix_profiles_rls_recursion.sql
-- profiles 테이블 RLS 무한 재귀 수정
-- 기존 "Admins can view all profiles" 정책이 public.profiles를 자기참조하여
-- infinite recursion (42P17) 오류를 유발. security definer 함수를 사용해 재귀 제거.

-- 관리자 여부 판별 함수 (security definer: RLS 우회하여 재귀 없이 조회)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 기존 재귀 정책 제거
drop policy if exists "Admins can view all profiles" on public.profiles;

-- 함수 기반 정책으로 재생성
create policy "Admins can view all profiles" on public.profiles
  for select using (public.is_admin());
