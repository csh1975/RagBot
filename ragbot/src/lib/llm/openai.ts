import OpenAI from 'openai'
import { LLMClient } from './index'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY,
      baseURL: process.env.LLM_BASE_URL, // optional for custom endpoints
    })
  }
  return client
}

export const openaiAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await getClient().chat.completions.create({
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
