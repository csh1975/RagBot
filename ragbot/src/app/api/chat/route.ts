/**
 * RAG 챗봇 API
 * POST /api/chat
 * 
 * 요청:
 * {
 *   messages: [{ role: 'user' | 'assistant', content: string }],
 *   documentIds?: string[],  // 특정 문서만 검색 (선택)
 *   category?: string,       // 카테고리 필터 (선택)
 *   matchCount?: number      // 검색할 청크 수 (기본 5)
 * }
 * 
 * 응답: 스트리밍 (text/event-stream)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchChunks } from '@/lib/rag/search'
import { getLLMClient } from '@/lib/llm'

const DEFAULT_MATCH_COUNT = 5
const MAX_MATCH_COUNT = 20

// 시스템 프롬프트 (RAG용)
const SYSTEM_PROMPT = `당신은 대전교육연수원 사내 문서 기반 RAG 챗봇입니다.
제공된 문서 내용을 바탕으로 사용자의 질문에 정확하고 도움이 되는 답변을 생성하세요.

규칙:
1. 제공된 문서 내용(컨텍스트)만을 근거로 답변하세요.
2. 문서에 없는 내용은 "제공된 문서에서 확인할 수 없습니다"라고 답변하세요.
3. 답변 시 관련 문서의 출처(문서 제목, 페이지 번호 등)를 명시하세요.
4. 한국어로 자연스럽고 정중하게 답변하세요.
5. 추측이나 일반적인 지식으로 답변하지 마세요.`

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
    const { messages, documentIds, category, matchCount = DEFAULT_MATCH_COUNT } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: '메시지가 필요합니다' },
        { status: 400 }
      )
    }

    // 마지막 사용자 메시지 추출
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMessage) {
      return NextResponse.json(
        { success: false, error: '사용자 메시지가 필요합니다' },
        { status: 400 }
      )
    }

    // 1. 유사도 검색 (임베딩 생성 + 문서 제목 조회 포함)
    const searchResults = await searchChunks(lastUserMessage.content, {
      matchCount: Math.min(matchCount, MAX_MATCH_COUNT),
      category,
    })

    // 2. 컨텍스트 구성
    const contextChunks = searchResults.map((row, index: number) => {
      const pageNum = row.pageNumber ? ` (p.${row.pageNumber})` : ''
      return `[${index + 1}] ${row.content}${pageNum}`
    }).join('\n\n')

    // 3. LLM용 메시지 구성
    const contextMessage = contextChunks
      ? `다음은 관련 문서 내용입니다:\n\n${contextChunks}\n\n위 문서를 참고하여 질문에 답변하세요.`
      : '관련 문서를 찾을 수 없습니다. 제공된 문서에서 확인할 수 없다고 답변하세요.'

    const llmMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: contextMessage },
      ...messages.slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    // 4. LLM 스트리밍 응답
    let llmClient
    try {
      llmClient = getLLMClient()
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'LLM 클라이언트 초기화 실패' },
        { status: 500 }
      )
    }

    const model = process.env.LLM_MODEL

    // 스트리밍 응답 생성
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamIter = llmClient.streamChat({
            systemPrompt: SYSTEM_PROMPT,
            messages: llmMessages,
            model,
          })

          // 출처 정보 먼저 전송
          const sources = searchResults.map(row => ({
            chunkId: row.chunkId,
            documentId: row.documentId,
            documentTitle: row.documentTitle,
            pageNumber: row.pageNumber,
            similarity: row.similarity,
            preview: row.content.slice(0, 200) + (row.content.length > 200 ? '...' : ''),
          }))

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sources', data: sources })}\n\n`))

          // 응답 스트리밍
          for await (const chunk of streamIter) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'content', data: chunk })}\n\n`))
          }

          // 완료 신호
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`))
          controller.close()
        } catch (error) {
          console.error('[Chat] 스트리밍 오류:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: '응답 생성 중 오류가 발생했습니다' })}\n\n`))
          controller.close()
        }
      }
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('[Chat] 예외 발생:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}