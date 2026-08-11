-- 002_enable_pgvector.sql
-- pgvector 확장 활성화 (임베딩 벡터 저장용)
-- Supabase에서 pgvector는 기본적으로 설치되어 있으나 확장은 명시적으로 활성화 필요

create extension if not exists vector;