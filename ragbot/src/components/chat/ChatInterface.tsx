'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type SourceDocumentUIPart } from 'ai'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { SourceCitations, type SourceLike } from './SourceCitations'

interface ChatInterfaceProps {
  initialCategories?: string[]
}

/** source-document 파트에서 화면 표시용 SourceLike로 변환 */
function toSourceLike(part: SourceDocumentUIPart): SourceLike {
  const meta = part.providerMetadata?.ragbot
  return {
    sourceId: part.sourceId,
    title: part.title,
    providerMetadata: {
      chunkId: typeof meta?.chunkId === 'string' ? meta.chunkId : undefined,
      documentId: typeof meta?.documentId === 'string' ? meta.documentId : undefined,
      pageNumber: typeof meta?.pageNumber === 'number' ? meta.pageNumber : null,
      similarity: typeof meta?.similarity === 'number' ? meta.similarity : undefined,
      preview: typeof meta?.preview === 'string' ? meta.preview : undefined,
    },
  }
}

export function ChatInterface({ initialCategories = [] }: ChatInterfaceProps) {
  const [category, setCategory] = useState('')
  const [input, setInput] = useState('')

  // 카테고리는 트랜스포트 body에 실려 /api/chat로 함께 전송된다
  const { messages, sendMessage, status, error, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { category },
    }),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || status === 'submitted' || status === 'streaming') return
    sendMessage({ text })
    setInput('')
  }

  // 모든 어시스턴트 메시지에서 source-document 파트 수집
  const sources: SourceLike[] = messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => m.parts)
    .filter((p): p is SourceDocumentUIPart => p.type === 'source-document')
    .map(toSourceLike)

  const isLoading = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">RagBot 챗봇</h1>
          {initialCategories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input text-sm py-1 px-3 max-w-xs"
              aria-label="카테고리 선택"
            >
              <option value="">전체 카테고리</option>
              {initialCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      <MessageList messages={messages} isLoading={isLoading} />

      <MessageInput
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        error={error}
      />

      {sources.length > 0 && (
        <SourceCitations sources={sources} onClose={() => { /* 출처는 최신 응답 기준으로 유지, 닫기 UI 최소화 */ }} />
      )}
    </div>
  )
}
