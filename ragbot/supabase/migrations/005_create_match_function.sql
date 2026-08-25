-- 005_create_match_function.sql
-- pgvector 유사도 검색 함수: match_document_chunks
-- query_embedding: 검색할 임베딩 벡터 (3072차원 - gemini-embedding-001)
-- match_count: 반환할 최대 결과 수
-- category_filter: 선택적 카테고리 필터 (null이면 전체)
-- 반환: chunk_id, content, metadata, document_id, similarity (0~1, 높을수록 유사)

create or replace function public.match_document_chunks(
  query_embedding vector(3072),
  match_count int default 10,
  category_filter text default null
)
returns table (
  chunk_id uuid,
  content text,
  metadata jsonb,
  document_id uuid,
  similarity float
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    dc.id as chunk_id,
    dc.content,
    dc.metadata,
    dc.document_id,
    1 - (dc.embedding <=> query_embedding) as similarity  -- cosine similarity
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.embedding is not null
    and (category_filter is null or d.category = category_filter)
  order by dc.embedding <=> query_embedding  -- 벡터 거리 순 (가까운 순)
  limit match_count;
end $$;

-- 함수 실행 권한: 인증된 사용자
grant execute on function public.match_document_chunks(vector(1536), int, text) to authenticated;