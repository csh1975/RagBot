'use client'

import { useEffect, useRef } from 'react'
import type { UIMessage } from 'ai'

interface MessageListProps {
  messages: UIMessage[]
  isLoading: boolean
}

/** UIMessage에서 텍스트 파트만 추출해 하나의 문자열로 만든다 */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('')
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
      <span className="flex gap-1">
        <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
      <span className="text-sm">답변 생성 중...</span>
    </div>
  )
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // 새 메시지가 추가되면 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const lastAssistantIndex = messages.map(m => m.role).lastIndexOf('assistant')

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center pt-16 text-gray-400 dark:text-gray-500 animate-fade-in">
            <p className="text-lg font-medium mb-2">무엇을 도와드릴까요?</p>
            <p className="text-sm">사내 문서를 근거로 질문에 답변해 드립니다.</p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === 'user'
          const isLastAssistant = index === lastAssistantIndex && message.role === 'assistant'
          const showCursor = isLastAssistant && isLoading
          const text = messageText(message)

          if (isUser) {
            return (
              <div key={message.id} className="flex justify-end animate-fade-in">
                <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5">
                  <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
                </div>
              </div>
            )
          }

          return (
            <div key={message.id} className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                <p className="whitespace-pre-wrap break-words leading-relaxed text-gray-900 dark:text-gray-100">
                  {text}
                  {showCursor && text.length > 0 && <span className="streaming-cursor" />}
                </p>
              </div>
            </div>
          )
        })}

        {isLoading && messages.length > 0 && lastAssistantIndex === -1 && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <LoadingIndicator />
            </div>
          </div>
        )}

        {isLoading && messages.length === 0 && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-3">
              <LoadingIndicator />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
