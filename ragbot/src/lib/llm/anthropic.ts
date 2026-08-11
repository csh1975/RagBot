import Anthropic from '@anthropic-ai/sdk'
import { LLMClient } from './index'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.LLM_API_KEY,
    })
  }
  return client
}

export const anthropicAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await getClient().messages.create({
      model: model || process.env.LLM_MODEL || 'claude-sonnet-4-6',
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
