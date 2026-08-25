import { openaiAdapter } from './openai'
import { anthropicAdapter } from './anthropic'
import { customAdapter } from './custom'
import { geminiAdapter } from './gemini'

export interface LLMClient {
  streamChat(params: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    model?: string
  }): AsyncIterable<string>
}

export type LLMProvider = 'anthropic' | 'openai' | 'custom' | 'gemini'

export function getLLMClient(): LLMClient {
  const provider = (process.env.LLM_PROVIDER || 'gemini') as LLMProvider

  switch (provider) {
    case 'anthropic':
      return anthropicAdapter
    case 'openai':
      return openaiAdapter
    case 'custom':
      return customAdapter
    case 'gemini':
      return geminiAdapter
    default:
      throw new Error(`Unknown LLM provider: ${provider}`)
  }
}