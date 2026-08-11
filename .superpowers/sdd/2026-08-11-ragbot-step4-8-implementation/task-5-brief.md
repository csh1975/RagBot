# Task 5 Brief: Build Chat UI Page (/chat)

## IMPORTANT CONTEXT — deviates from plan.md as approved by user

The plan's original Task 5 code was written for the AI SDK v3/v4 API (`useChat` from `ai/react`, `handleSubmit`, `handleInputChange`, `messages: {role, content}[]`, custom SSE protocol). The current AI SDK v5 has breaking changes. **The user approved refactoring `/api/chat` to the AI SDK protocol** so `useChat` works natively. This brief is the v5-corrected version. The UI component structure from the plan (ChatInterface, MessageList, MessageInput, SourceCitations) is preserved.

### AI SDK v5 key facts (verified against official docs)
- Install `ai` AND `@ai-sdk/react` (useChat is in `@ai-sdk/react` in v5, NOT `ai/react`)
- Server-side stream building: `createUIMessageStream({ execute({ writer }) {...} })` from `ai`, wrap with `createUIMessageStreamResponse({ stream })` from `ai`
- Client: `useChat` from `@ai-sdk/react`, transport-based. Default transport posts to `/api/chat`.
- Messages are `UIMessage` objects with `.parts: UIMessagePart[]`. Text lives in parts with `type: 'text'`. To render text: `message.parts.filter(p => p.type === 'text').map(p => p.text)`
- `sendMessage({ text })` to submit; input state managed by user via `useState` (v5 no longer manages input internally)
- `status` state ('ready' | 'submitted' | 'streaming' | 'error'), `stop()` to abort, `error` for errors
- **Sources**: AI SDK v5 has a first-class `source` part. Server writes:
  ```ts
  writer.write({
    type: 'source',
    value: {
      type: 'source',
      sourceType: 'document',
      id: 'source-1',
      title: '문서 제목',
      mediaType: 'text/plain',   // required for sourceType 'document'
      providerMetadata: { ... }, // arbitrary custom data
    },
  })
  ```
  Client reads: `message.parts.filter(p => p.type === 'source')` — each part has `.value` (the object) plus `.title`, `.url?`, `.mediaType?`, `.providerMetadata` fields on the part itself. **Implementer must verify exact field names against installed types in node_modules** (`SourceUrlUIPart`/`SourceDocumentUIPart`).

## Current /api/chat behavior (to preserve)
- Auth required (session check)
- Body: `{ messages: [{role, content}], documentIds?, category?, matchCount? }`
- Last user message → `searchChunks()` → build context
- LLM via `getLLMClient().streamChat({ systemPrompt, messages, model })` — returns `AsyncIterable<string>`
- Streams: sources first, then content deltas, then done
- Error handling: 401 (no auth), 400 (bad request), 500 (server error) as `{ success: false, error }`
- 2026 addition from Task 4 fix: `model` is `process.env.LLM_MODEL` (string | undefined), passed to streamChat

## Refactored /api/chat design (AI SDK v5 protocol)

```typescript
// src/app/api/chat/route.ts (REWRITE, keep auth + validation + search)
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { searchChunks } from '@/lib/rag/search'
import { getLLMClient } from '@/lib/llm'

export async function POST(request: NextRequest) {
  // 1. Auth check (existing logic) → 401
  // 2. Parse body, validate messages → 400
  // 3. lastUserMessage → searchResults = await searchChunks(...)
  // 4. Build context (existing logic)
  // 5. llmClient = getLLMClient() — on throw return 500 { success:false, error:'LLM 클라이언트 초기화 실패' }
  // 6. Build stream:
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // 6a. Emit sources FIRST (before any text), one write per source
      searchResults.forEach((source, i) => {
        writer.write({
          type: 'source',
          value: {
            type: 'source',
            sourceType: 'document',
            id: `source-${i + 1}`,
            title: source.documentTitle,
            mediaType: 'text/plain',
            providerMetadata: {
              chunkId: source.chunkId,
              documentId: source.documentId,
              pageNumber: source.pageNumber ?? null,
              similarity: source.similarity,
              preview: source.content.slice(0, 200) + (source.content.length > 200 ? '...' : ''),
            },
          },
        })
      })

      // 6b. Stream text via the LLM adapter
      const llmClient = getLLMClient()  // reuse from outer scope
      writer.write({ type: 'text-start', id: 'text-1' })
      try {
        const streamIter = llmClient.streamChat({
          systemPrompt: SYSTEM_PROMPT,
          messages: llmMessages,   // built in step 4
          model: process.env.LLM_MODEL ?? '',
        })
        for await (const chunk of streamIter) {
          writer.write({ type: 'text-delta', id: 'text-1', delta: chunk })
        }
      } catch (err) {
        console.error('[Chat] LLM stream error:', err)
        writer.write({ type: 'error', error: '응답 생성 중 오류가 발생했습니다' })
        return
      }
      writer.write({ type: 'text-end', id: 'text-1' })
    },
    onError: (err) => {
      console.error('[Chat] stream error:', err)
      return '응답 생성 중 오류가 발생했습니다'
    },
  })

  // 7. Return
  return createUIMessageStreamResponse({ stream })
}
```

**CRITICAL VERIFICATION for implementer:** The exact `UIMessageChunk` types (`text-start`, `text-delta`, `text-end`, `source`, `error`) and `createUIMessageStreamResponse` signature MUST be verified against the installed `ai` package's type definitions in `node_modules/ai/dist/*.d.ts`. AI SDK v5 is evolving; if `writer.write({ type: 'source', value: ... })` shape differs (e.g. field `value` vs inline fields), adapt to the installed types. The `model` field in streamChat is `string | undefined` per Task 4 fix — pass `process.env.LLM_MODEL` directly or empty-string default; do NOT default to 'gpt-4o'.

---

## Files

- Create: `ragbot/src/app/chat/page.tsx`
- Create: `ragbot/src/components/chat/ChatInterface.tsx`
- Create: `ragbot/src/components/chat/MessageList.tsx`
- Create: `ragbot/src/components/chat/MessageInput.tsx`
- Create: `ragbot/src/components/chat/SourceCitations.tsx`
- Rewrite: `ragbot/src/app/api/chat/route.ts` (AI SDK v5 protocol)
- Modify: `ragbot/package.json` (add `ai`, `@ai-sdk/react`)

## Interfaces
- Consumes: `/api/chat` (AI SDK v5 stream protocol), `useChat` from `@ai-sdk/react`
- Produces: Full chat page with streaming, source citations, category filter

## Steps

- [ ] **Step 1: Install AI SDK v5**
  ```bash
  cd ragbot && npm install ai @ai-sdk/react
  ```
  Verify installed versions. Read the type defs for `createUIMessageStream`, `UIMessageChunk`, `useChat` before writing code.

- [ ] **Step 2: Rewrite `/api/chat` route per design above**
  Preserve: auth (401), message validation (400), last-user-message extraction, `searchChunks` call, context building, system prompt. Replace the manual `ReadableStream`/`TextEncoder` SSE with `createUIMessageStream`/`createUIMessageStreamResponse`. Emit sources before text. Keep the `model` behavior from Task 4 fix (`process.env.LLM_MODEL`, no hardcoded default).

- [ ] **Step 3: Create ChatInterface component** (`src/components/chat/ChatInterface.tsx`)

  ```tsx
  'use client'

  import { useChat } from '@ai-sdk/react'
  import { useState } from 'react'
  import { MessageList } from './MessageList'
  import { MessageInput } from './MessageInput'
  import { SourceCitations } from './SourceCitations'

  interface ChatInterfaceProps {
    initialCategories?: string[]
  }

  export function ChatInterface({ initialCategories = [] }: ChatInterfaceProps) {
    const [category, setCategory] = useState('')

    const { messages, sendMessage, status, error, stop } = useChat({
      api: '/api/chat',
      body: { category },
    })

    const [input, setInput] = useState('')

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault()
      if (!input.trim() || status !== 'ready') return
      sendMessage({ text: input })
      setInput('')
    }

    // 마지막 어시스턴트 메시지의 출처 파트 수집
    const sources = messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => m.parts.filter(p => p.type === 'source'))
      .map(p => p.value) // value shape from server

    const isLoading = status === 'submitted' || status === 'streaming'

    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">RagBot 챗봇</h1>
            {initialCategories.length > 0 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="input text-sm py-1 px-3 max-w-xs"
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
          <SourceCitations sources={sources} onClose={() => { /* sources는 상태 유지, 닫기 UI는 최소화 */ }} />
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Create MessageList component** (`src/components/chat/MessageList.tsx`)
  Renders `UIMessage[]`. Extract text from parts:
  ```tsx
  message.parts.filter(p => p.type === 'text').map(p => p.text).join('')
  ```
  Loading indicator (3 bouncing dots) when `isLoading`. Use `animate-fade-in` class. Structure per plan (assistant left, user right, blue bubble for user). Show streaming cursor (`streaming-cursor` class) on last assistant message while streaming.

- [ ] **Step 5: Create MessageInput component** (`src/components/chat/MessageInput.tsx`)
  Controlled input (props: input, setInput, handleSubmit, isLoading, stop, error). Error display red box. Submit disabled when empty or loading. "중지" button when loading.

- [ ] **Step 6: Create SourceCitations component** (`src/components/chat/SourceCitations.tsx`)
  Props: `sources: SourceLike[]`, `onClose: () => void`. `SourceLike` interface matching server providerMetadata + title:
  ```ts
  interface SourceLike {
    title?: string
    providerMetadata?: {
      chunkId?: string
      documentId?: string
      pageNumber?: number | null
      similarity?: number
      preview?: string
    }
    // 서버 응답 형태에 따라 필드명 조정 (install된 ai 타입 확인)
  }
  ```
  Shows count header "참고 문서 (N)", each row: documentTitle, pageNumber, similarity %, preview (line-clamp-2), index badge. Style per plan.

- [ ] **Step 7: Create chat page** (`src/app/chat/page.tsx`)
  Server component. Auth check via `createClient()` from `@/lib/supabase/server` → redirect to `/auth/login?redirectTo=/chat` if no user. Fetch categories:
  ```tsx
  async function getCategories() {
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('category')
      .not('category', 'is', null)
    return [...new Set(data?.map(d => d.category).filter(Boolean) as string[])]
  }
  ```
  Render `<ChatInterface initialCategories={categories} />`. Add `export const metadata` (title: '챗봇 - RagBot').

- [ ] **Step 8: Verify**
  ```bash
  cd ragbot && npm run build
  ```
  Must pass cleanly. Also verify `/api/chat` still returns 401 for unauthenticated requests and 400 for invalid bodies (code-level review; you may not have auth cookies).

## Verification Requirements
- `npm run build` passes with no TS errors
- No `any` (project constraint) — use `unknown` + narrowing or proper types for source parts
- No hardcoded LLM vendor or model default in route (Task 4 fix preserved)
- Sources emitted before text in the stream
- Auth/validation errors unchanged (401/400/500 with same Korean messages where reasonable)

## Report File
Write full report to: `D:\DEV\RagBot\.superpowers\sdd\2026-08-11-ragbot-step4-8-implementation\task-5-report.md`

Report must include:
1. Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
2. Files created/modified
3. Test summary (npm run build output)
4. Which exact `ai`/`@ai-sdk/react` versions were installed
5. Any API-shape deviations from this brief's example code (the brief's UIMessageChunk shapes may not exactly match installed v5 types — document what you actually used)
6. Concerns/observations
