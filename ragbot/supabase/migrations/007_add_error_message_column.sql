-- 007_add_error_message_column.sql
-- documents 테이블에 error_message 컬럼 추가 (실패 사유 기록용)

alter table public.documents
add column if not exists error_message text;

-- 코멘트 추가
comment on column public.documents.error_message is '문서 처리 실패 시 에러 메시지 저장';