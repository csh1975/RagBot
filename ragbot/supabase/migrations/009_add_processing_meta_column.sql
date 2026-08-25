-- documents 테이블에 processing_meta 컬럼 추가
-- 임베딩 부분 실패 정보 등 처리 중간 상태 기록용 (jsonb)

alter table public.documents
add column if not exists processing_meta jsonb default '{}';

comment on column public.documents.processing_meta is '문서 처리 중간 상태 정보 (부분 실패 청크 인덱스 등)';
