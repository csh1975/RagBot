# Task 3 Review Package

## Brief
Task 3: Extract search logic to reusable lib/rag/search.ts

## Files Changed
1. `ragbot/src/lib/rag/search.ts` (NEW)
2. `ragbot/src/app/api/search/route.ts` (MODIFIED)
3. `ragbot/src/app/api/chat/route.ts` (MODIFIED)

## Diff Summary
- Created `searchChunks(query, options)` in `lib/rag/search.ts` with explicit `MatchChunkRow` type (no `any`)
- `searchChunks` encapsulates: embedding generation → match_document_chunks RPC → document title lookup → result formatting
- search API route now uses `searchChunks` (removed inline logic + debug queryEmbedding field)
- chat API route now uses `searchChunks`, drops the separate document title re-fetch (uses returned `documentTitle`/`pageNumber`)

## Key Notes
- `documentIds` option in `SearchOptions` kept for future RPC extension (current RPC doesn't support doc filtering)
- `pageNumber` extracted safely with typeof check on metadata
- Build passes cleanly

## Implementer Concerns
- Removed debug-only `queryEmbedding` field from search API response (nothing consumed it; keeping it would double embedding calls)
- OpenAI key has no credits so end-to-end embedding search couldn't run (RPC/DB layer verified with synthetic vector)
- Local Node fetch needs `NODE_TLS_REJECT_UNAUTHORIZED=0` due to corporate cert interception