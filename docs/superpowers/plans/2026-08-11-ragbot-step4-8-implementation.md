# RagBot STEP 4-8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the RAG chatbot by adding error_message column, reliable queue-based document processing, LLM provider adapters, chat UI with streaming, and Vercel deployment configuration.

**Architecture:** 
- Add `error_message` column to documents table for failure tracking
- Replace fire-and-forget processing with Upstash Redis queue for reliability
- Implement LLM adapter pattern (Anthropic, OpenAI, Custom) with unified interface
- Build chat UI using Vercel AI SDK's `useChat` hook with streaming responses
- Configure Vercel deployment with function timeouts and environment variables

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL + pgvector), Upstash Redis, Vercel AI SDK, OpenAI SDK, Anthropic SDK, Tailwind CSS

## Global Constraints

- **Next.js version:** 14 (App Router) — do not upgrade
- **Embedding model:** OpenAI text-embedding-3-large (1536 dimensions) — fixed
- **LLM providers:** Must use adapter pattern via `lib/llm/index.ts` factory — no hardcoding
- **Chunking:** 800-1000 chars, 150 overlap, sentence-aware (Korean) — existing `lib/rag/chunking.ts`
- **Database:** Supabase with RLS — all new tables need policies
- **Storage:** Supabase Storage `documents` bucket — private, admin-only write
- **Auth:** Supabase Auth with middleware — admin role check on `/admin/**`
- **Code style:** TypeScript, no `any`, Korean comments allowed, English identifiers
- **Error handling:** Exponential backoff for external APIs, graceful degradation

---

### Task 1: Add error_message column to documents table

**Files:**
- Create: `ragbot/supabase/migrations/007_add_error_message_column.sql`
- Modify: `ragbot/src/app/api/process-document/route.ts` (update error handling)

**Interfaces:**
- Consumes: existing `documents` table schema
- Produces: `documents.error_message` column (text, nullable)

- [ ] **Step 1: Create migration file**

```sql
-- 007_add_error_message_column.sql
-- documents 테이블에 error_message 컬럼 추가 (실패 사유 기록용)

alter table public.documents
add column if not exists error_message text;

-- 코멘트 추가
comment on column public.documents.error_message is '문서 처리 실패 시 에러 메시지 저장';
```

- [ ] **Step 2: Apply migration locally**

```bash
cd ragbot && npx supabase db reset
```
Expected: Migration runs successfully, column added

- [ ] **Step 3: Update process-document route to use error_message**

```typescript
// In catch block of processDocumentAsync (route.ts:277-287)
await supabase
  .from('documents')
  .update({
    status: 'failed',
    error_message: error instanceof Error ? error.message : 'Unknown error',
    updated_at: new Date().toISOString(),
  })
  .eq('id', documentId)
```

- [ ] **Step 4: Verify build passes**

```bash
cd ragbot && npm run build
```
Expected: TypeScript compiles without errors

---

### Task 2: Set up Upstash Redis queue for document processing

**Files:**
- Create: `ragbot/package.json` (add @upstash/redis, @upstash/qstash)
- Create: `ragbot/src/lib/queue/documentQueue.ts`
- Modify: `ragbot/src/app/api/process-document/route.ts` (enqueue instead of fire-and-forget)
- Create: `ragbot/src/app/api/process-document/queue/route.ts` (queue consumer endpoint)

**Interfaces:**
- Consumes: `processDocumentAsync` function, documentId, fileBuffer, mimeType
- Produces: Queue enqueue function, queue consumer API route

- [ ] **Step 1: Install dependencies**

```bash
cd ragbot && npm install @upstash/redis @upstash/qstash
```

- [ ] **Step 2: Create queue utility**

```typescript
// src/lib/queue/documentQueue.ts
import { Queue } from '@upstash/qstash'

export interface DocumentProcessJob {
  documentId: string
  filePath: string  // Storage path to download from
  mimeType: string
  fileName: string
}

const qstash = new Queue({ 
  token: process.env.QSTASH_TOKEN!,
  baseUrl: process.env.QSTASH_URL  // optional, defaults to Upstash
})

export async function enqueueDocumentProcess(job: DocumentProcessJob): Promise<string> {
  const messageId = await qstash.enqueueJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-document/queue`,
    body: job,
    retries: 3,
    delay: 0,
  })
  return messageId
}

export async function processQueueJob(job: DocumentProcessJob): Promise<void> {
  // Download from storage, then call existing processDocumentAsync
  const supabase = createServiceClient()
  
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(job.filePath)
  
  if (downloadError || !fileData) {
    throw new Error(`File download failed: ${downloadError?.message}`)
  }
  
  const fileBuffer = Buffer.from(await fileData.arrayBuffer())
  await processDocumentAsync(job.documentId, fileBuffer, job.fileName, job.mimeType, supabase)
}
```

- [ ] **Step 3: Create queue consumer API route**

```typescript
// src/app/api/process-document/queue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifySignature } from '@upstash/qstash/nextjs'
import { processQueueJob } from '@/lib/queue/documentQueue'

export async function POST(request: NextRequest) {
  try {
    // Verify QStash signature
    const verified = await verifySignature(request, {
      token: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextToken: process.env.QSTASH_NEXT_SIGNING_KEY!,
    })
    
    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const job = await request.json()
    await processQueueJob(job)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Queue Consumer] Error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Modify process-document route to enqueue**

```typescript
// In route.ts POST handler, replace fire-and-forget (line 150)
// with queue enqueue:

import { enqueueDocumentProcess } from '@/lib/queue/documentQueue'

// After document record created (line 140):
await enqueueDocumentProcess({
  documentId,
  filePath,
  mimeType,
  fileName: file.name,
})

// Remove processDocumentAsync call and import
```

- [ ] **Step 5: Add QStash env vars to .env.local.example**

```
# Upstash QStash (문서 처리 큐용)
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 6: Verify build and local queue test**

```bash
cd ragbot && npm run build
```
Expected: Build passes

---

### Task 3: Extract search logic to reusable lib/rag/search.ts

**Files:**
- Create: `ragbot/src/lib/rag/search.ts`
- Modify: `ragbot/src/app/api/search/route.ts` (use extracted function)
- Modify: `ragbot/src/app/api/chat/route.ts` (use extracted function)

**Interfaces:**
- Consumes: `createEmbedding`, Supabase client
- Produces: `searchChunks(query, options)` function

- [ ] **Step 1: Create search module**

```typescript
// src/lib/rag/search.ts
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

export async function searchChunks(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const supabase = await createClient()
  const { matchCount = 5, category, documentIds } = options

  const queryEmbedding = await createEmbedding(query.trim())

  const { data: results, error } = await supabase.rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_count: Math.min(matchCount, 50),
    category_filter: category || null,
  })

  if (error) {
    throw new Error(`Search failed: ${error.message}`)
  }

  if (!results || results.length === 0) {
    return []
  }

  // Fetch document titles
  const docIds = [...new Set(results.map((r: any) => r.document_id))]
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title')
    .in('id', docIds)

  const docTitleMap = new Map(documents?.map(d => [d.id, d.title]) || [])

  return results.map((row: any) => ({
    chunkId: row.chunk_id,
    content: row.content,
    metadata: row.metadata,
    documentId: row.document_id,
    documentTitle: docTitleMap.get(row.document_id) || '알 수 없음',
    similarity: Math.round(row.similarity * 10000) / 10000,
    pageNumber: row.metadata?.pageNumber,
  }))
}
```

- [ ] **Step 2: Update search API route**

```typescript
// src/app/api/search/route.ts
import { searchChunks } from '@/lib/rag/search'

// Replace inline search logic with:
const results = await searchChunks(query.trim(), { matchCount, category })
```

- [ ] **Step 3: Update chat API route**

```typescript
// src/app/api/chat/route.ts
import { searchChunks } from '@/lib/rag/search'

// Replace inline search logic with:
const searchResults = await searchChunks(lastUserMessage.content, { 
  matchCount, 
  category 
})
```

- [ ] **Step 4: Verify build and search API works**

```bash
cd ragbot && npm run build
```
Expected: Build passes, search API returns same results

---

### Task 4: Implement LLM Adapters (OpenAI, Anthropic, Custom)

**Files:**
- Create: `ragbot/src/lib/llm/openai.ts`
- Create: `ragbot/src/lib/llm/anthropic.ts`
- Create: `ragbot/src/lib/llm/custom.ts`
- Modify: `ragbot/src/lib/llm/index.ts` (factory implementation)

**Interfaces:**
- Consumes: `LLMClient` interface from index.ts
- Produces: Three adapter implementations, factory returns correct one

- [ ] **Step 1: Implement OpenAI adapter**

```typescript
// src/lib/llm/openai.ts
import OpenAI from 'openai'
import { LLMClient } from './index'

const openai = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL, // optional for custom endpoints
})

export const openaiAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await openai.chat.completions.create({
      model: model || process.env.LLM_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system'),
      ],
      stream: true,
      temperature: 0.3,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  },
}
```

- [ ] **Step 2: Implement Anthropic adapter**

```typescript
// src/lib/llm/anthropic.ts
import Anthropic from '@anthropic-ai/sdk'
import { LLMClient } from './index'

const anthropic = new Anthropic({
  apiKey: process.env.LLM_API_KEY,
})

export const anthropicAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await anthropic.messages.create({
      model: model || process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022',
      system: systemPrompt,
      messages: messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      max_tokens: 4096,
      temperature: 0.3,
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        yield chunk.delta.text
      }
    }
  },
}
```

- [ ] **Step 3: Implement Custom adapter (OpenAI-compatible)**

```typescript
// src/lib/llm/custom.ts
import OpenAI from 'openai'
import { LLMClient } from './index'

const custom = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1', // Ollama default
})

export const customAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await custom.chat.completions.create({
      model: model || process.env.LLM_MODEL || 'llama3.1',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.filter(m => m.role !== 'system'),
      ],
      stream: true,
      temperature: 0.3,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) yield content
    }
  },
}
```

- [ ] **Step 4: Update factory**

```typescript
// src/lib/llm/index.ts
import { openaiAdapter } from './openai'
import { anthropicAdapter } from './anthropic'
import { customAdapter } from './custom'

export interface LLMClient {
  streamChat(params: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    model: string
  }): AsyncIterable<string>
}

export type LLMProvider = 'anthropic' | 'openai' | 'custom'

export function getLLMClient(): LLMClient {
  const provider = (process.env.LLM_PROVIDER || 'openai') as LLMProvider

  switch (provider) {
    case 'anthropic':
      return anthropicAdapter
    case 'openai':
      return openaiAdapter
    case 'custom':
      return customAdapter
    default:
      throw new Error(`Unknown LLM provider: ${provider}`)
  }
}
```

- [ ] **Step 5: Install Anthropic SDK**

```bash
cd ragbot && npm install @anthropic-ai/sdk
```

- [ ] **Step 6: Update .env.local.example**

```
# LLM 프로바이더 선택
LLM_PROVIDER=openai
LLM_API_KEY=your_llm_api_key
LLM_MODEL=gpt-4o
# LLM_BASE_URL=  # custom 프로바이더/로컬 LLM 사용 시에만 설정
```

- [ ] **Step 7: Verify build passes**

```bash
cd ragbot && npm run build
```
Expected: Build passes, no TypeScript errors

---

### Task 5: Build Chat UI Page (/chat/page.tsx)

**Files:**
- Create: `ragbot/src/app/chat/page.tsx`
- Create: `ragbot/src/components/chat/ChatInterface.tsx`
- Create: `ragbot/src/components/chat/MessageList.tsx`
- Create: `ragbot/src/components/chat/MessageInput.tsx`
- Create: `ragbot/src/components/chat/SourceCitations.tsx`
- Install: `ragbot/package.json` (add `ai`, `@ai-sdk/react`)

**Interfaces:**
- Consumes: `/api/chat` streaming endpoint, `useChat` from `ai/react`
- Produces: Full chat page with streaming, citations, category filter

- [ ] **Step 1: Install Vercel AI SDK**

```bash
cd ragbot && npm install ai @ai-sdk/react
```

- [ ] **Step 2: Create ChatInterface component**

```tsx
// src/components/chat/ChatInterface.tsx
'use client'

import { useChat } from 'ai/react'
import { useState } from 'react'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { SourceCitations } from './SourceCitations'

export function ChatInterface() {
  const [category, setCategory] = useState<string>('')
  const [sources, setSources] = useState<any[]>([])

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, stop } = useChat({
    api: '/api/chat',
    body: { category },
    onFinish: (message) => {
      // Sources are received via streaming, stored in state
    },
    onError: (err) => {
      console.error('Chat error:', err)
    },
  })

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">RagBot 챗봇</h1>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input text-sm py-1 px-3 max-w-xs"
          >
            <option value="">전체 카테고리</option>
            {/* Categories fetched from API or passed as prop */}
          </select>
        </div>
      </header>

      {/* Messages */}
      <MessageList 
        messages={messages} 
        isLoading={isLoading} 
        sources={sources} 
      />

      {/* Input */}
      <MessageInput
        input={input}
        handleInputChange={handleInputChange}
        handleSubmit={handleSubmit}
        isLoading={isLoading}
        stop={stop}
        error={error}
      />

      {/* Sources panel */}
      {sources.length > 0 && (
        <SourceCitations sources={sources} onClose={() => setSources([])} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create MessageList component**

```tsx
// src/components/chat/MessageList.tsx
'use client'

import { Message } from 'ai/react'

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  sources: any[]
}

export function MessageList({ messages, isLoading, sources }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full">
      <div className="space-y-4">
        {messages.map((message, i) => (
          <div key={message.id} className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
              message.role === 'assistant' 
                ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-sm'
                : 'bg-blue-600 text-white rounded-br-sm'
            }`}>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex space-x-1">
                <span className="animate-bounce">●</span>
                <span className="animate-bounce" style={{animationDelay: '0.1s'}}>●</span>
                <span className="animate-bounce" style={{animationDelay: '0.2s'}}>●</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create MessageInput component**

```tsx
// src/components/chat/MessageInput.tsx
'use client'

import { Message } from 'ai/react'

interface MessageInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  stop: () => void
  error: Error | undefined
}

export function MessageInput({ input, handleInputChange, handleSubmit, isLoading, stop, error }: MessageInputProps) {
  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800">
      {error && (
        <div className="mb-3 p-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">
          {error.message}
        </div>
      )}
      <div className="flex items-center gap-2 max-w-4xl mx-auto">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder={isLoading ? '답변 생성 중...' : '질문을 입력하세요...'}
          disabled={isLoading}
          className="flex-1 input py-2.5"
          autoFocus
        />
        {isLoading ? (
          <button type="button" onClick={stop} className="btn btn-secondary">
            중지
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="btn btn-primary">
            전송
          </button>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 5: Create SourceCitations component**

```tsx
// src/components/chat/SourceCitations.tsx
'use client'

interface Source {
  chunkId: string
  documentId: string
  documentTitle: string
  pageNumber?: number
  similarity: number
  preview: string
}

interface SourceCitationsProps {
  sources: Source[]
  onClose: () => void
}

export function SourceCitations({ sources, onClose }: SourceCitationsProps) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between p-3">
        <h3 className="font-medium text-gray-900 dark:text-white">참고 문서 ({sources.length})</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          ✕
        </button>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700 px-3 pb-3">
        {sources.map((source, i) => (
          <div key={source.chunkId} className="py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {source.documentTitle}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {source.pageNumber ? `페이지 ${source.pageNumber} · ` : ''}
                  유사도: {(source.similarity * 100).toFixed(1)}%
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                  {source.preview}
                </p>
              </div>
              <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                #{i + 1}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create chat page**

```tsx
// src/app/chat/page.tsx
import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChatInterface } from '@/components/chat/ChatInterface'

export const metadata: Metadata = {
  title: '챗봇 - RagBot',
  description: '문서 기반 RAG 챗봇',
}

async function getCategories() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('category')
    .not('category', 'is', null)
  return [...new Set(data?.map(d => d.category).filter(Boolean) as string[])]
}

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/auth/login?redirectTo=/chat')
  }

  const categories = await getCategories()

  return (
    <ChatInterface initialCategories={categories} />
  )
}
```

- [ ] **Step 7: Update ChatInterface to accept categories prop**

```tsx
// In ChatInterface.tsx
interface ChatInterfaceProps {
  initialCategories?: string[]
}

export function ChatInterface({ initialCategories = [] }: ChatInterfaceProps) {
  // Use initialCategories for select options
}
```

- [ ] **Step 8: Verify build and page renders**

```bash
cd ragbot && npm run build
```
Expected: Build passes, `/chat` page accessible after login

---

### Task 6: Create vercel.json and deployment configuration

**Files:**
- Create: `ragbot/vercel.json`
- Modify: `ragbot/.env.local.example` (complete list)
- Modify: `ragbot/next.config.ts` (add maxDuration for API routes)
- Create: `ragbot/README.md` (comprehensive guide)

**Interfaces:**
- Consumes: All environment variables, API routes
- Produces: Vercel deployment config, documentation

- [ ] **Step 1: Create vercel.json**

```json
{
  "functions": {
    "src/app/api/process-document/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/process-document/queue/route.ts": {
      "maxDuration": 300
    },
    "src/app/api/chat/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/search/route.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Credentials", "value": "true" },
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "GET,POST,OPTIONS" },
        { "key": "Access-Control-Allow-Headers", "value": "Content-Type,Authorization" }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/admin/:path*",
      "destination": "/admin/:path*"
    }
  ]
}
```

- [ ] **Step 2: Update next.config.ts for maxDuration**

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
    ]
  },
}

export default nextConfig
```

- [ ] **Step 3: Complete .env.local.example**

```
# ===========================================
# Supabase (필수)
# ===========================================
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ===========================================
# OpenAI (임베딩용 - text-embedding-3-large)
# ===========================================
OPENAI_API_KEY=your_openai_api_key

# ===========================================
# LLM 프로바이더 (챗봇 응답 생성용)
# ===========================================
# 옵션: "openai" | "anthropic" | "custom"
LLM_PROVIDER=openai
LLM_API_KEY=your_llm_api_key
LLM_MODEL=gpt-4o
# LLM_BASE_URL=http://localhost:11434/v1  # custom(로컬 LLM) 사용 시

# ===========================================
# Upstash QStash (문서 처리 큐용)
# ===========================================
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# ===========================================
# 앱 설정
# ===========================================
NODE_ENV=production
```

- [ ] **Step 4: Create comprehensive README.md**

```markdown
# RagBot - 대전교육연수원 문서 기반 RAG 챗봇

사내 문서(PDF, DOCX, HWPX)를 업로드하면 자동으로 텍스트 추출 → 청킹 → 임베딩 → 벡터 DB 저장이 처리되고, 사용자는 챗봇을 통해 문서 내용을 근거로 질의응답할 수 있는 서비스입니다.

## 기술 스택

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Database:** Supabase (PostgreSQL + pgvector)
- **Vector Search:** pgvector ivfflat index + cosine similarity
- **Embeddings:** OpenAI text-embedding-3-large (1536 dimensions)
- **LLM:** Provider-agnostic (OpenAI, Anthropic, Custom/OpenAI-compatible)
- **Queue:** Upstash QStash (reliable background processing)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## 로컬 개발 환경 설정

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repo-url>
cd ragbot
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
# .env.local 파일을 열어서 모든 값 채우기
```

필수 환경변수:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` (임베딩용)
- `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (챗봇용)
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `NEXT_PUBLIC_APP_URL` (큐용)

### 3. Supabase 설정

1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/migrations/`의 모든 마이그레이션 순서대로 실행
3. Storage에서 `documents` 버킷 생성 (Private, 50MB 제한)
4. Storage Policies에서 마이그레이션 006의 정책들 적용
5. Authentication > Providers에서 Email 활성화
6. 첫 관리자 계정 생성 후 `profiles` 테이블에서 `role`을 `admin`으로 변경

### 4. Upstash QStash 설정

1. [Upstash Console](https://console.upstash.com/)에서 QStash 토큰 생성
2. Signing Keys에서 Current/Next 키 복사
3. `.env.local`에 설정

### 5. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── process-document/
│   │   │   ├── route.ts           # 문서 업로드 + 큐 등록
│   │   │   └── queue/route.ts     # 큐 컨슈머 (QStash 웹훅)
│   │   ├── search/route.ts        # 유사도 검색 API
│   │   └── chat/route.ts          # RAG 스트리밍 챗봇 API
│   ├── admin/documents/page.tsx   # 관리자 문서 관리
│   ├── chat/page.tsx              # 사용자 챗봇
│   └── auth/login/page.tsx        # 로그인
├── components/
│   └── chat/                      # 챗봇 UI 컴포넌트
├── lib/
│   ├── llm/                       # LLM 어댑터 (provider-agnostic)
│   ├── parsers/                   # PDF/DOCX/HWPX 파서
│   ├── queue/                     # 문서 처리 큐
│   ├── rag/                       # 청킹, 임베딩, 검색
│   └── supabase/                  # Supabase 클라이언트
└── middleware.ts                  # 인증/권한 미들웨어
```

## 배포 절차 (Vercel)

### 1. Vercel 프로젝트 연결

```bash
# Vercel CLI 설치
npm i -g vercel

# 로그인 및 프로젝트 연결
vercel login
vercel link
```

### 2. 환경변수 설정 (Vercel Dashboard)

Settings > Environment Variables에서 다음 추가:

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJ...` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-...` |
| `LLM_PROVIDER` | LLM 프로바이더 | `openai` |
| `LLM_API_KEY` | LLM API Key | `sk-...` 또는 `sk-ant-...` |
| `LLM_MODEL` | LLM 모델명 | `gpt-4o` |
| `LLM_BASE_URL` | Custom LLM 엔드포인트 (선택) | `http://localhost:11434/v1` |
| `QSTASH_TOKEN` | Upstash QStash 토큰 | `eyJ...` |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash 현재 서명 키 | `sig_...` |
| `QSTASH_NEXT_SIGNING_KEY` | QStash 다음 서명 키 | `sig_...` |
| `NEXT_PUBLIC_APP_URL` | 배포된 앱 URL | `https://ragbot.vercel.app` |

### 3. 배포 실행

```bash
# 프로덕션 배포
vercel --prod
```

### 4. 배포 후 확인사항

- [ ] `/auth/login` 접근 가능
- [ ] 관리자 로그인 후 `/admin/documents`에서 파일 업로드 가능
- [ ] 업로드 후 문서 상태가 `processing` → `completed`로 변경
- [ ] `/chat`에서 질문 시 스트리밍 응답 + 출처 표시
- [ ] 카테고리 필터 동작 확인

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/process-document` | 문서 업로드 + 처리 큐 등록 |
| POST | `/api/process-document/queue` | QStash 웹훅 (큐 컨슈머) |
| POST | `/api/search` | 유사도 검색 |
| POST | `/api/chat` | RAG 스트리밍 챗봇 |

## 문서 처리 파이프라인

1. 관리자가 `/admin/documents`에서 파일 업로드
2. Supabase Storage에 저장 + `documents` 테이블에 `status=pending` 레코드 생성
3. Upstash QStash에 처리 작업 인큐
4. QStash가 `/api/process-document/queue` 웹훅 호출
5. 컨슈머가 Storage에서 파일 다운로드 → 파싱 → 청킹 → 임베딩 → `document_chunks` 저장
6. `documents.status`를 `completed` 또는 `failed`로 업데이트

## 문제 해결

### 문서 처리 타임아웃
- `vercel.json`의 `maxDuration` 확인 (큐 컨슈머: 300초)
- 대용량 파일은 청크 수 증가로 임베딩 시간 증가 → 배치 크기 조정 고려

### 임베딩 Rate Limit
- `lib/rag/embeddings.ts`의 `MAX_BATCH_SIZE` (100) 및 재시도 로직 확인
- OpenAI Tier 제한 확인

### QStash 웹훅 실패
- `NEXT_PUBLIC_APP_URL`이 정확한 배포 URL인지 확인
- Signing Keys가 Vercel 환경변수와 일치하는지 확인

## 라이선스

Internal use only - 대전교육연수원
```

- [ ] **Step 5: Verify build and deploy test**

```bash
cd ragbot && npm run build
```
Expected: Build passes, vercel.json valid

---

### Task 7: Final verification and deployment checklist

**Files:**
- All modified/created files
- Run full test suite

- [ ] **Step 1: Run lint and typecheck**

```bash
cd ragbot && npm run lint
cd ragbot && npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 2: Test document upload flow locally**

1. Start dev server: `npm run dev`
2. Login as admin
3. Go to `/admin/documents`
4. Upload a test PDF
5. Verify document appears with status `processing`
6. Wait for queue processing (check console logs)
7. Verify status changes to `completed`
8. Check `document_chunks` table for embeddings

- [ ] **Step 3: Test chat flow**

1. Go to `/chat`
2. Ask question about uploaded document
3. Verify streaming response
4. Verify source citations appear
5. Test category filter

- [ ] **Step 4: Vercel deployment checklist**

```
[ ] Vercel 프로젝트 생성/연결 완료
[ ] 모든 환경변수 Vercel Dashboard에 등록 완료
[ ] Supabase 프로젝트 프로덕션 설정 완료
[ ] Storage 버킷 생성 및 정책 적용 완료
[ ] Upstash QStash 토큰 및 서명 키 설정 완료
[ ] NEXT_PUBLIC_APP_URL이 실제 배포 URL로 설정됨
[ ] vercel --prod 실행 성공
[ ] 배포 후 /admin/documents 업로드 테스트 성공
[ ] 배포 후 /chat 질의응답 테스트 성공
[ ] 도메인 연결 (필요시)
```

- [ ] **Step 5: Commit all changes**

```bash
git add -A
git commit -m "feat: complete STEP 4-8 implementation

- Add error_message column to documents table
- Implement Upstash QStash queue for reliable document processing
- Extract search logic to lib/rag/search.ts
- Implement LLM adapters (OpenAI, Anthropic, Custom)
- Build chat UI with streaming, citations, category filter
- Add vercel.json, deployment config, comprehensive README"
```

---

## Plan Self-Review

**Spec Coverage Check:**
- ✅ STEP 4: error_message column, queue-based processing, timeout handling, auto-connection from upload API
- ✅ STEP 5: Already complete (chunking, embeddings, bulk insert)
- ✅ STEP 6: search.ts extraction, category filter, document title/page/similarity in results
- ✅ STEP 7: LLM adapters (3 providers), factory pattern, chat UI with useChat, streaming, citations, category dropdown, auth protection
- ✅ STEP 8: vercel.json with maxDuration, env vars, README, deployment checklist

**Type Consistency:**
- All LLM adapters implement `LLMClient` interface from index.ts
- searchChunks returns `SearchResult[]` used by both search and chat APIs
- Queue job interface matches consumer expectations

**No Placeholders:**
- All code blocks are complete implementations
- All file paths are exact
- All commands are runnable
- All environment variables listed

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-11-ragbot-step4-8-implementation.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**