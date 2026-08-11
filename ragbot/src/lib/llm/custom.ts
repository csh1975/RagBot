import OpenAI from 'openai'
import { LLMClient } from './index'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.LLM_API_KEY || 'dummy', // Ollama는 apiKey를 무시하므로 dummy 값 사용
      baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1', // Ollama default
    })
  }
  return client
}

export const customAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model }) {
    const stream = await getClient().chat.completions.create({
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
