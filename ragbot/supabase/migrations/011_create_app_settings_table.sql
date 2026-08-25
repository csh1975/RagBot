-- 011_create_app_settings_table.sql
-- �� 설정 테이블 (API 키 등 저장용)

CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_secret BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 활성화
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 관리자만 조회/수정 가능 (이미 존재하면 생략)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'Admins can manage app_settings' AND polrelid = 'public.app_settings'::regclass
  ) THEN
    CREATE POLICY "Admins can manage app_settings" ON public.app_settings
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END$$;

-- 기본 설정 ��입
INSERT INTO public.app_settings (key, value, description, is_secret) VALUES
  ('gemini_api_key', '""', 'Google Gemini API Key (for embeddings + chat)', TRUE),
  ('embedding_model', '"text-embedding-004"', 'Embedding model name', FALSE),
  ('embedding_dimension', '3072', 'Embedding vector dimension', FALSE),
  ('llm_model', '"gemini-1.5-flash"', 'LLM model for chat', FALSE)
ON CONFLICT (key) DO NOTHING;

-- updated_at 자동 ��신 트리거
CREATE OR REPLACE FUNCTION public.update_app_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER trigger_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_app_settings_updated_at();