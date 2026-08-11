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