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