# Task 3 Report: Extract search logic to reusable lib/rag/search.ts

## 1. Status
DONE_WITH_CONCERNS

## 2. Files created/modified
- Created: `ragbot/src/lib/rag/search.ts` — `searchChunks(query, options)` + `SearchOptions`, `SearchResult` interfaces. Uses explicit `MatchChunkRow` type (no `any`), fetches document titles internally, returns `documentTitle`/`pageNumber` per chunk.
- Modified: `ragbot/src/app/api/search/route.ts` — replaced inline embedding+RPC logic with `searchChunks(query.trim(), { matchCount, category })`.
- Modified: `ragbot/src/app/api/chat/route.ts` — replaced inline embedding+RPC+separate title-fetch with `searchChunks(...)`; now uses returned `documentTitle`/`pageNumber` fields for sources and context instead of re-fetching titles.

## 3. Test summary
- `npm run build` — **PASS** (TypeScript compiles clean; all routes build; earlier TS error on `pageNumber: unknown` fixed by narrowing `typeof row.metadata?.pageNumber === 'number'` and by typing `docTitleMap` as `Map<string, string>`).
- `npm run lint` — **PASS, 0 errors**, 5 warnings all pre-existing (unused `documentIds`/`e` in chat route, unused vars in middleware/process-document/admin — none introduced by this task).
- Live DB verification via standalone script (`search-test.js`, then removed) against the real Supabase project:
  - `match_document_chunks` RPC accepted `query_embedding`/`match_count`/`category_filter` params and executed successfully → **0 results** with a zero vector (expected; embedding call skipped because OpenAI key has no credits).
  - `documents` table queryable: **0 rows**; `document_chunks` table queryable: **0 rows** (DB is empty — no documents uploaded yet, so no title-join results to display).
  - Migration `005_create_match_function.sql` confirmed RPC signature `(vector(1536), int, text)` matches the call; granted to `authenticated` role only (consistent with route auth-first flow).

## 4. Concerns / observations
1. **`queryEmbedding` debug field removed from `/api/search` response.** The old route returned `queryEmbedding.slice(0, 5)` labeled "디버깅용" (debug only). No client code consumes it (verified via grep). Keeping it would require a duplicate OpenAI embedding call per request, so it was removed. Response shape still returns `{ success, data: { results } }`.
2. **OpenAI API key has no credits** — end-to-end embedding→search could not be exercised live; RPC/DB layer verified with synthetic 1536-dim vector instead.
3. **Node 26.4.0 on Windows crashes at process exit with `UV_HANDLE_CLOSING` assertion** after supabase-js requests (known undici/libuv teardown quirk). It occurs after all output is printed and is environmental, not a code issue.
4. **Local TLS interception** (SELF_SIGNED_CERT_IN_CHAIN) breaks Node fetch to Supabase unless `NODE_TLS_REJECT_UNAUTHORIZED=0` — environmental (corporate cert), affects local dev only, not deployed Vercel.
5. `documentIds` kept in `SearchOptions` interface for future use; unused by the RPC call as specified (RPC has no document filter).
6. Chat route now maps search errors to the generic 500 handler ("서버 오류가 발생했습니다") since `searchChunks` throws instead of returning a `searchError` — same HTTP status as before, slightly different message.
