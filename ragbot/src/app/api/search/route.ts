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
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchChunks } from '@/lib/rag/search'

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

    // 유사도 검색 (임베딩 생성 포함)
    const results = await searchChunks(query.trim(), { matchCount, category })

    return NextResponse.json({
      success: true,
      data: {
        results,
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