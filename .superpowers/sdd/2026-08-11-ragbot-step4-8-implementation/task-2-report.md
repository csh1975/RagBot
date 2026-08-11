# Task 2 Implementer Report

## Status: DONE

## What Was Implemented

### 1. src/lib/queue/documentQueue.ts (NEW)
- Upstash QStash queue utility using v2 API (`Client.queue().enqueueJSON`)
- `DocumentProcessJob` interface: `{ documentId, filePath, mimeType, fileName }`
- `getQStashClient()` — lazy client creation at call time to handle serverless env injection (avoids module-load-time `QSTASH_TOKEN` missing warnings)
- `enqueueDocumentProcess(job)` — enqueues job to `/api/process-document/queue` with 3 retries
- `processQueueJob(job)` — downloads file from Storage, then calls exported `processDocumentAsync`

### 2. src/app/api/process-document/queue/route.ts (NEW)
- Queue consumer endpoint using `verifySignatureAppRouter` from `@upstash/qstash/nextjs` (v2 correct API)
- `force-dynamic` export

### 3. src/app/api/process-document/route.ts (MODIFIED)
- `processDocumentAsync` now exported (for reuse by queue consumer)
- Replaced fire-and-forget with `enqueueDocumentProcess` call
- Added enqueue failure handling: marks document as `failed` with `error_message`, cleans up storage file

### 4. .env.local.example (MODIFIED)
- Added QStash env vars (QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, NEXT_PUBLIC_APP_URL)

## API Version Notes
- The plan's brief example used v1 QStash API (`new Queue()`), but installed `@upstash/qstash` is v2 where the API is `new Client().queue().enqueueJSON()`. Implemented with v2.
- `verifySignature` was replaced with `verifySignatureAppRouter` — the v2 correct signature for Next.js App Router.

## Test Summary
- `npm run build`: PASSED (clean, TypeScript compiles without errors)
- No runtime test of queue flow (requires actual QStash credentials)

## Concerns
- None blocking. QStash flow requires real credentials to fully test.

---

# Task 2 Review Fix Report

## Status: DONE

## Findings Fixed

### Fix 1 (Critical): enqueueDocumentProcess no longer throws at runtime
- Root cause confirmed in installed `@upstash/qstash` v2.11.3: `Client.queue().enqueueJSON()` delegates to `Queue.enqueue()`, which throws `"Please provide a queue name to the Queue constructor"` before any network call when no `queueName` is set.
- **Fix:** `src/lib/queue/documentQueue.ts` now uses `getQStashClient().publishJSON({ url, body, retries: 3, delay: 0 })` — a single-consumer fire-and-forget publish that requires no queue name. Still returns `response.messageId`. `@upstash/qstash` `PublishRequest` type supports both `retries` and `delay`, verified against the installed `.d.ts`.

### Fix 2 (Important): Circular import removed
- **Before:** `documentQueue.ts` → `@/app/api/process-document/route` and `route.ts` → `@/lib/queue/documentQueue`.
- **Fix:** `processDocumentAsync` extracted verbatim to new file `src/lib/rag/processDocument.ts` (signature unchanged: `(documentId, fileBuffer, fileName, mimeType, supabase: ReturnType<typeof createServiceClient>)`). Both `documentQueue.ts` and `process-document/route.ts` now import from `@/lib/rag/processDocument`. `route.ts` re-exports it (`export { processDocumentAsync }`) for backward compatibility.
- Removed now-unused imports from `route.ts` (`parsePDF`, `parseHWPX`/`isHWPXFile`, `parseDOCX`/`isDOCXFile`, `chunkTextWithPages`, `ChunkResult`, `createBatchEmbeddings`, `validateEmbedding`).

## Files Changed
- `src/lib/queue/documentQueue.ts` (import + `publishJSON`)
- `src/lib/rag/processDocument.ts` (NEW — extracted processing logic)
- `src/app/api/process-document/route.ts` (import/re-export, removed inline function)

## Test Summary
- `npm run build` (Next.js 16.3.0, Turbopack): PASSED — compiled successfully, TypeScript finished with no errors. Pre-existing warning only: middleware file convention deprecated (unrelated to this task).

## Commits
- `2fd027a` (root commit): `feat(queue): add Upstash QStash queue for document processing` — includes this task's work plus previously staged Task 1 scaffold.

## Concerns
- `ragbot/.env.local.example` is ignored by `.gitignore` (standard `.env*` rule), so the QStash env var additions are not committed. Env vars are documented there for local use only.
- QStash/Supabase flow not runtime-tested (requires real credentials). Verified statically against installed library types.