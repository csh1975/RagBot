/**
 * 유사도 검색 로직 (searchChunks)
 * - 임베딩 생성부터 문서 제목 조회까지 RAG 검색 파이프라인을 캡슐화
 * - /api/search, /api/chat 양쪽에서 재사용
 */

import { createClient } from '@/lib/supabase/server'
import { createEmbedding } from '@/lib/rag/embeddings'

export interface SearchOptions {
  matchCount?: number
  category?: string
  documentIds?: string[]
}

export interface SearchResult {
  chunkId: string
  content: string
  metadata: Record<string, unknown>
  documentId: string
  documentTitle: string
  similarity: number
  pageNumber?: number
}

// match_document_chunks RPC 결과 행 타입
interface MatchChunkRow {
  chunk_id: string
  content: string
  metadata: Record<string, unknown>
  document_id: string
  similarity: number
}

/**
 * 쿼리 임베딩 생성 후 유사도 검색 수행, 문서 제목까지 매핑해 반환
 */
export async function searchChunks(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const supabase = await createClient()
  const { matchCount = 5, category } = options

  // documentIds는 향후 RPC 확장 시 사용 예정 (현재 match_document_chunks는 문서 필터 미지원)

  const queryEmbedding = await createEmbedding(query.trim())

  const { data: results, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: Math.min(matchCount, 50), // 최대 50개 제한
    category_filter: category || null,
  })

  if (error) {
    throw new Error(`Search failed: ${error.message}`)
  }

  const rows = (results || []) as MatchChunkRow[]

  if (rows.length === 0) {
    return []
  }

  // 문서 제목 조회 (출처 표시용)
  const docIds = [...new Set(rows.map(row => row.document_id))]
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title')
    .in('id', docIds)

  const docTitleMap = new Map<string, string>((documents || []).map(doc => [doc.id, doc.title]))

  return rows.map(row => ({
    chunkId: row.chunk_id,
    content: row.content,
    metadata: row.metadata,
    documentId: row.document_id,
    documentTitle: docTitleMap.get(row.document_id) || '알 수 없음',
    similarity: Math.round(row.similarity * 10000) / 10000, // 소수점 4자리
    pageNumber: typeof row.metadata?.pageNumber === 'number' ? row.metadata.pageNumber : undefined,
  }))
}
