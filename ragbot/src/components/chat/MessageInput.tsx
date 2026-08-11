'use client'

import { useRef } from 'react'

interface MessageInputProps {
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  stop: () => void
  error?: Error
}

export function MessageInput({
  input,
  setInput,
  handleSubmit,
  isLoading,
  stop,
  error,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter는 줄바꿈, Enter는 전송
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3">
      <div className="max-w-4xl mx-auto">
        {error && (
          <div className="mb-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm animate-fade-in">
            {error.message || '오류가 발생했습니다'}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="질문을 입력하세요. (Enter: 전송, Shift+Enter: 줄바꿈)"
            className="input resize-none max-h-32 py-2.5"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              type="button"
              onClick={() => stop()}
              className="btn btn-danger flex-shrink-0 px-4"
            >
              중지
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="btn btn-primary flex-shrink-0 px-4"
            >
              전송
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
