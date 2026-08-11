/**
 * 유사도 검색 API
 * POST /api/search
 * 
 * 요청:
 * {
 *   query: string,           // 검색 쿼리
 *   matchCount?: number,     // 반환할 최대 결과 수 (기본 10)
 *   category?: string        // 카테고리 필터 (선택)
 * }
 * 
 * 응답:
 * {
 *   success: boolean,
 *   data: {
 *     results: [
 *       {
 *         chunkId: string,
 *         content: string,
 *         metadata: object,
 *         documentId: string,
 *         documentTitle: string,
 *         similarity: number
 *       }
 *     ],
 *     queryEmbedding: number[]
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createEmbedding } from '@/lib/rag/embeddings'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // 인증 확인
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다' },
        { status: 401 }
      )
    }

    // 요청 파싱
    const body = await request.json()
    const { query, matchCount = 10, category } = body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '검색 쿼리가 필요합니다' },
        { status: 400 }
      )
    }

    // 쿼리 임베딩 생성
    const queryEmbedding = await createEmbedding(query.trim())

    // 유사도 검색 함수 호출
    const { data: results, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_count: Math.min(matchCount, 50), // 최대 50개 제한
      category_filter: category || null,
    })

    if (error) {
      console.error('[Search] 검색 실패:', error)
      return NextResponse.json(
        { success: false, error: '검색 중 오류가 발생했습니다' },
        { status: 500 }
      )
    }

    // 결과 포맷팅
    const formattedResults = (results || []).map((row: {
      chunk_id: string
      content: string
      metadata: Record<string, unknown>
      document_id: string
      similarity: number
    }) => ({
      chunkId: row.chunk_id,
      content: row.content,
      metadata: row.metadata,
      documentId: row.document_id,
      similarity: Math.round(row.similarity * 10000) / 10000, // 소수점 4자리
    }))

    return NextResponse.json({
      success: true,
      data: {
        results: formattedResults,
        queryEmbedding: queryEmbedding.slice(0, 5), // 디버깅용 앞 5개만
      }
    })

  } catch (error) {
    console.error('[Search] 예외 발생:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}