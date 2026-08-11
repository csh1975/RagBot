# Task 4 Review Package

## Brief
Task 4: Implement LLM Adapters (OpenAI, Anthropic, Custom) + factory wiring

## Files Changed
1. `ragbot/src/lib/llm/openai.ts` (NEW)
2. `ragbot/src/lib/llm/anthropic.ts` (NEW)
3. `ragbot/src/lib/llm/custom.ts` (NEW)
4. `ragbot/src/lib/llm/index.ts` (MODIFIED — factory now returns adapters)
5. `ragbot/package.json` (MODIFIED — added @anthropic-ai/sdk@^0.116.0)

## Diff Summary
- Three adapters each implement `LLMClient.streamChat({ systemPrompt, messages, model }): AsyncIterable<string>`
- openai.ts / custom.ts use openai SDK v7 (chat.completions.create stream), filter out system role messages
- anthropic.ts uses @anthropic-ai/sdk (messages.create stream), handles content_block_delta/text_delta
- index.ts factory: `getLLMClient()` switches on `LLM_PROVIDER` env (default 'openai'), throws on unknown
- custom adapter defaults baseURL to Ollama local endpoint
- .env.local.example NOT modified (already had LLM section from STEP 7 planning — brief Step 6 skipped intentionally)

## Key Notes
- openai SDK v7.4.0 already installed; @anthropic-ai/sdk newly installed
- LLM_BASE_URL supports custom endpoints
- Build passes cleanly

## Implementer Concerns
- Adapters construct SDK clients at module load (per brief) — missing LLM_API_KEY throws at import, caught by chat route's catch
- Anthropic SDK is v0.116.0 (latest), brief code compiled fine