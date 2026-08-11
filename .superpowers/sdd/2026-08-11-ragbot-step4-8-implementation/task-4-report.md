# Task 4 Report: Implement LLM Adapters (OpenAI, Anthropic, Custom)

## 1. Status
**DONE**

## 2. Files created/modified

Created:
- `ragbot/src/lib/llm/openai.ts` — OpenAI adapter (brief Step 1, verbatim)
- `ragbot/src/lib/llm/anthropic.ts` — Anthropic adapter (brief Step 2, verbatim)
- `ragbot/src/lib/llm/custom.ts` — Custom/OpenAI-compatible adapter (brief Step 3, verbatim)

Modified:
- `ragbot/src/lib/llm/index.ts` — Factory implementation wiring the three adapters (brief Step 4, verbatim; import order: openai/anthropic/custom per brief)

Not modified (per constraints):
- `src/app/api/chat/route.ts` — untouched; call site `getLLMClient().streamChat({ systemPrompt, messages, model })` satisfied by the new factory.
- `.env.local.example` — brief Step 6 skipped: the LLM_PROVIDER/LLM_API_KEY/LLM_MODEL/LLM_BASE_URL section was already present.

Dependency:
- `@anthropic-ai/sdk@^0.116.0` installed (brief Step 5) via `npm install @anthropic-ai/sdk`. 7 packages added, 0 vulnerabilities.

## 3. Test summary

### `npm run build`
PASSED cleanly — Next.js 16.3.0 (Turbopack), compiled successfully, TypeScript finished with no errors, all routes generated (/, /_not-found, /admin/documents, /api/chat, /api/process-document, /api/process-document/queue, /api/search, /auth/login).

Only pre-existing warning: deprecated `middleware` file convention (unrelated to this task).

### Runtime smoke test (`getLLMClient` for each provider)
Compiled the four LLM module files to CJS with `tsc` (strict) and ran a node script that set `LLM_PROVIDER` to `openai`/`anthropic`/`custom` and asserted each returned adapter has a callable `streamChat` async-generator method:

```
OK: provider=openai -> adapter instantiated, streamChat is async generator
OK: provider=anthropic -> adapter instantiated, streamChat is async generator
OK: provider=custom -> adapter instantiated, streamChat is async generator
SMOKE TEST PASSED
```

Note: the smoke test required `LLM_API_KEY` to be set in the shell before node ran, because the adapters construct their SDK clients at module load. (See concern 2.) Temp test artifacts (`smoke-llm.ts`, `temp-llm-out/`) were removed afterwards.

## 4. Concerns / observations

1. **Anthropic SDK version**: installed `@anthropic-ai/sdk@^0.116.0` (latest). The brief's reference code (written against ~v0.x) compiled cleanly under `strict: true`, including the `messages.filter(m => m.role !== 'system').map(...)` chain — no type-narrowing error on `role` occurred with the installed version. Default model fallback in the adapter is `claude-3-5-sonnet-20241022` (per brief) — note `.env.local.example` suggests `LLM_MODEL=claude-sonnet-4-6`, which is fine since the env var takes precedence at runtime.

2. **Module-load client construction**: all three adapters construct their SDK client at module import time (`const openai = new OpenAI({ apiKey: process.env.LLM_API_KEY, ... })`). This is safe in the Next.js runtime because `.env.local` is loaded before modules execute (verified: `next build` loaded `.env.local`). However, if `LLM_API_KEY` is unset/empty, openai v7 throws `OpenAIError: Missing credentials` at import time — so a misconfigured deployment will fail fast on `getLLMClient()` and the chat route's catch block (`'LLM 클라이언트 초기화 실패'`) handles it. Per the task instructions I kept the brief's module-level construction rather than lazy init; errors are not swallowed and propagate to the route handler.

3. **`LLM_BASE_URL` handling**: the openai adapter passes `baseURL: process.env.LLM_BASE_URL` (undefined → SDK default). The custom adapter defaults to `http://localhost:11434/v1` (Ollama). Matches brief exactly.

4. **openai SDK v7**: `openai@^7.4.0` already installed; the reference code using `new OpenAI({ apiKey, baseURL })` and `chat.completions.create({ stream: true })` compiled and constructed successfully with no v7-specific issues. No code changes were needed for SDK compatibility.

5. **RLS/security**: no DB or storage changes involved in this task. API keys remain server-side only.
