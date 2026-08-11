/**
 * RAG 챗봇 API
 * POST /api/chat
 *
 * AI SDK v5 UI 메시지 스트림 프로토콜을 사용한다.
 * 클라이언트(useChat)가 전송하는 요청:
 * {
 *   messages: UIMessage[],     // parts 기반 메시지
 *   documentIds?: string[],    // 특정 문서만 검색 (선택)
 *   category?: string,         // 카테고리 필터 (선택)
 *   matchCount?: number,       // 검색할 청크 수 (기본 5)
 *   id?: string,               // chat id
 *   trigger?: string,          // 'submit-message' | 'regenerate-message' ...
 *   messageId?: string
 * }
 *
 * 응답: AI SDK UI 메시지 스트림 (SSE) — 출처(source-document) 먼저, 그 다음 텍스트 스트리밍
 */

import { NextRequest, NextResponse } from 'next/server'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { searchChunks } from '@/lib/rag/search'
import { getLLMClient, type LLMClient } from '@/lib/llm'

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

// useChat이 보내는 UIMessage와 기존 {role, content} 형태를 모두 수용하기 위한 최소 타입
interface IncomingMessage {
  role?: string
  content?: string
  parts?: Array<{ type?: string; text?: string }>
}

interface ChatRequestBody {
  messages?: unknown
  documentIds?: unknown
  category?: unknown
  matchCount?: unknown
}

/** 메시지에서 텍스트 추출 (UIMessage의 parts 또는 기존 content 필드) */
function extractMessageText(message: IncomingMessage): string {
  if (typeof message.content === 'string' && message.content.trim()) {
    return message.content
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter(part => part.type === 'text')
      .map(part => part.text ?? '')
      .join('')
  }
  return ''
}

/** UIMessage 배열을 LLM 어댑터가 받는 {role, content} 배열로 변환 */
function toLLMMessages(messages: IncomingMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role as 'user' | 'assistant',
      content: extractMessageText(m),
    }))
    .filter(m => m.content.trim().length > 0)
}

/** 마지막 사용자 메시지 추출 */
function getLastUserMessage(messages: IncomingMessage[]): IncomingMessage | undefined {
  return [...messages].reverse().find(m => m.role === 'user' && extractMessageText(m).trim().length > 0)
}

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
    const body = (await request.json()) as ChatRequestBody
    const { messages, category, matchCount } = body

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: '메시지가 필요합니다' },
        { status: 400 }
      )
    }

    const incomingMessages = messages as IncomingMessage[]

    // 마지막 사용자 메시지 추출
    const lastUserMessage = getLastUserMessage(incomingMessages)
    if (!lastUserMessage) {
      return NextResponse.json(
        { success: false, error: '사용자 메시지가 필요합니다' },
        { status: 400 }
      )
    }

    // 1. 유사도 검색 (임베딩 생성 + 문서 제목 조회 포함)
    const searchResults = await searchChunks(extractMessageText(lastUserMessage), {
      matchCount: Math.min(typeof matchCount === 'number' ? matchCount : DEFAULT_MATCH_COUNT, MAX_MATCH_COUNT),
      category: typeof category === 'string' ? category : undefined,
    })

    // 2. 컨텍스트 구성
    const contextChunks = searchResults.map((row, index) => {
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
      ...toLLMMessages(incomingMessages).slice(-10),
    ]

    // 4. LLM 클라이언트 초기화 (실패 시 500)
    let llmClient: LLMClient
    try {
      llmClient = getLLMClient()
    } catch (error) {
      console.error('[Chat] LLM 클라이언트 초기화 실패:', error)
      return NextResponse.json(
        { success: false, error: 'LLM 클라이언트 초기화 실패' },
        { status: 500 }
      )
    }

    const model = process.env.LLM_MODEL

    // 5. UI 메시지 스트림 구성 (출처 먼저, 그 다음 텍스트)
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // 5a. 출처 정보를 먼저 전송 (텍스트보다 먼저)
        searchResults.forEach((row, index) => {
          writer.write({
            type: 'source-document',
            sourceId: `source-${index + 1}`,
            mediaType: 'text/plain',
            title: row.documentTitle,
            providerMetadata: {
              chunkId: row.chunkId,
              documentId: row.documentId,
              pageNumber: row.pageNumber ?? null,
              similarity: row.similarity,
              preview: row.content.slice(0, 200) + (row.content.length > 200 ? '...' : ''),
            },
          })
        })

        // 5b. 텍스트 스트리밍
        writer.write({ type: 'text-start', id: 'text-1' })
        try {
          const streamIter = llmClient.streamChat({
            systemPrompt: SYSTEM_PROMPT,
            messages: llmMessages,
            model,
          })
          for await (const chunk of streamIter) {
            writer.write({ type: 'text-delta', id: 'text-1', delta: chunk })
          }
        } catch (error) {
          console.error('[Chat] LLM 스트리밍 오류:', error)
          writer.write({ type: 'error', errorText: '응답 생성 중 오류가 발생했습니다' })
          return
        }
        writer.write({ type: 'text-end', id: 'text-1' })
      },
      onError: (error) => {
        console.error('[Chat] 스트림 오류:', error)
        return '응답 생성 중 오류가 발생했습니다'
      },
    })

    // 6. SSE 스트리밍 응답 반환
    return createUIMessageStreamResponse({ stream })

  } catch (error) {
    console.error('[Chat] 예외 발생:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
