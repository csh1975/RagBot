-- 003_create_documents_table.sql
-- documents 테이블: 업로드된 문서 메타데이터 관리
-- RLS 정책: 인증된 사용자 조회 가능, 관리자만 쓰기 가능

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_path text not null,           -- Supabase Storage 경로
  category text,                     -- 선택적 카테고리 분류
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS 활성화
alter table public.documents enable row level security;

-- 정책: 인증된 사용자는 조회만 가능
create policy "Authenticated users can view documents" on public.documents
  for select using (auth.role() = 'authenticated');

-- 정책: 관리자만 insert 가능
create policy "Admins can insert documents" on public.documents
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 정책: 관리자만 update 가능
create policy "Admins can update documents" on public.documents
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 정책: 관리자만 delete 가능
create policy "Admins can delete documents" on public.documents
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- updated_at 자동 갱신 트리거 (profiles와 동일 함수 재사용)
create trigger documents_updated_at
  before update on public.documents
  for each row execute procedure public.handle_updated_at();