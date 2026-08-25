-- 004_create_document_chunks_table.sql
-- document_chunks 테이블: 문서 청크 + 임베딩 벡터 저장
-- ivfflat 인덱스(cosine similarity)로 유사도 검색 최적화
-- RLS 정책: 인증된 사용자 조회 가능, 관리자만 쓰기 가능

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  content text not null,
  embedding vector(3072),                    -- Google Gemini text-embedding-001 차원 (3072)
  chunk_index int not null,                  -- 문서 내 순서
  metadata jsonb default '{}',               -- 페이지 번호, 섹션 등
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS 활성화
alter table public.document_chunks enable row level security;

-- 정책: 인증된 사용자는 조회만 가능 (해당 문서가 존재하는 경우)
create policy "Authenticated users can view chunks" on public.document_chunks
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from public.documents d
      where d.id = document_chunks.document_id
    )
  );

-- 정책: 관리자만 insert 가능
create policy "Admins can insert chunks" on public.document_chunks
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 정책: 관리자만 update 가능
create policy "Admins can update chunks" on public.document_chunks
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 정책: 관리자만 delete 가능
create policy "Admins can delete chunks" on public.document_chunks
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 유사도 검색용 ivfflat 인덱스 (cosine similarity)
-- lists: 대략 row 수 / 1000 권장, 초기 100으로 시작 (데이터 증가 시 재생성 필요)
create index document_chunks_embedding_idx
  on public.document_chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 문서별 청크 조회용 인덱스
create index document_chunks_document_id_idx
  on public.document_chunks (document_id);

-- 청크 순서 정렬용 인덱스
create index document_chunks_chunk_index_idx
  on public.document_chunks (document_id, chunk_index);