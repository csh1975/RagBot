export interface LLMClient {
  streamChat(params: {
    systemPrompt: string
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    model: string
  }): AsyncIterable<string>
}

export type LLMProvider = 'anthropic' | 'openai' | 'custom'

export function getLLMClient(): LLMClient {
  const provider = process.env.LLM_PROVIDER as LLMProvider

  switch (provider) {
    case 'anthropic':
      throw new Error('Anthropic adapter not implemented yet (STEP 7)')
    case 'openai':
      throw new Error('OpenAI adapter not implemented yet (STEP 7)')
    case 'custom':
      throw new Error('Custom adapter not implemented yet (STEP 7)')
    default:
      throw new Error(`Unknown LLM provider: ${provider}`)
  }
}