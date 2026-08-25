-- 010_change_embedding_dimension_to_768.sql
-- Gemini text-embedding-001 (3072차원)로 전환

-- 1. 기존 ivfflat 인덱스 삭제 (pgvector 2000차원 제한으로 인해 생략)
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- 2. 임베딩 ���???__(1536 → 3072)
ALTER TABLE public.document_chunks 
ALTER COLUMN embedding TYPE vector(3072);

-- 4. 기존 임베딩 데이터는 차원이 달라 사용할 수 없으므로 전체 삭제
-- (재처리 필요)
DELETE FROM public.document_chunks;

-- 5. 문서 상태 초기화 (재처리 트리거)
UPDATE public.documents 
SET status = 'pending', 
    error_message = NULL,
    processing_meta = '{}'::jsonb,
    updated_at = timezone('utc'::text, now())
WHERE status IN ('completed', 'failed', 'processing');

-- 6. 설정 테이블에 임베딩 모델 정보 저장용 ��럼 추가 (이미 있다면 무시)
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'gemini-embedding-001',
ADD COLUMN IF NOT EXISTS embedding_dimension INT DEFAULT 3072;