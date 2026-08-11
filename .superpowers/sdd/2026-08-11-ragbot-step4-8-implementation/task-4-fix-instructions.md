# Task 4 Fix Instructions (from review)

Two Important issues found by review. Fix both.

## Working directory: `D:\DEV\RagBot\ragbot`

## Fix 1: Lazy client construction

Problem: `openai.ts:4`, `custom.ts:4`, `anthropic.ts:4` construct SDK clients at module load. openai v7 throws `Missing credentials` in the constructor when apiKey is falsy. So with `LLM_API_KEY` unset, the throw happens at import evaluation — before `getLLMClient()` runs — and the chat route's try/catch (route.ts:92-100) becomes dead code. It also means `LLM_PROVIDER=custom` (Ollama, legitimately key-less) crashes at import.

Fix: Construct the SDK client lazily. Pattern:
```typescript
let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL,
    })
  }
  return client
}
```
Apply this lazy pattern to all three adapters. `streamChat` calls `getClient()`.

Note: openai v7 throws in the constructor only when apiKey is missing AND no OPENAI_API_KEY env fallback. The lazy pattern still throws at first streamChat call when key missing — but now the chat route's try/catch (which wraps `getLLMClient()` and the stream) will handle it appropriately, and `LLM_PROVIDER=custom` can import fine even without a key (constructor still needs an apiKey value for openai SDK — pass `process.env.LLM_API_KEY || 'dummy'` in custom.ts since Ollama ignores it. Do NOT do this in openai.ts).

For anthropic.ts: lazy pattern same, `new Anthropic({ apiKey: process.env.LLM_API_KEY })` — Anthropic SDK also throws on missing apiKey, lazy is fine.

## Fix 2: Per-provider model fallback unreachable

Problem: `LLMClient.model` is required `string` (index.ts:9), and route.ts:102 always computes `const model = process.env.LLM_MODEL || 'gpt-4o'` before calling streamChat. So adapter fallbacks (`model || process.env.LLM_MODEL || 'claude-...'`) never fire through the route. `LLM_PROVIDER=anthropic` with `LLM_MODEL` unset sends `'gpt-4o'` to Anthropic API → fails.

Fix:
1. Make `model` optional in the `LLMClient` interface: `model?: string` (index.ts:9)
2. Update `route.ts:102` so it doesn't inject a default: change `const model = process.env.LLM_MODEL || 'gpt-4o'` to `const model = process.env.LLM_MODEL` and pass `model` to streamChat (it will be `string | undefined`). The `model` key must still be present in the params object (interface allows optional, undefined value is fine).
3. Adapter fallback chains already correct — they now fire since model may be undefined.

Keep default fallbacks in adapters: openai.ts `'gpt-4o'`, custom.ts `'llama3.1'`, anthropic.ts change default from `'claude-3-5-sonnet-20241022'` to `'claude-sonnet-4-6'` to match .env.local.example.

## Constraints
- TypeScript, no `any`, Korean comments allowed, English identifiers
- Do not change the streamChat return type or the LLMClient.streamChat signature shape beyond the model optionality
- Do not touch migrations, other routes, or the UI

## Verify
- `npm run build` passes
- Confirm the chat route still compiles with `model: string | undefined`

## Report
Write your report to: `D:\DEV\RagBot\.superpowers\sdd\2026-08-11-ragbot-step4-8-implementation\task-4-fix-report.md`
Include: 1. Status 2. Files changed 3. Build output 4. How each fix was verified