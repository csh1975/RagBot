import { GoogleGenerativeAI } from '@google/generative-ai'
import type { LLMClient } from './index'
import { getSetting } from '@/lib/config/settings'

let _genAI: GoogleGenerativeAI | null = null

async function getGenAI(): Promise<GoogleGenerativeAI> {
  if (!_genAI) {
    const apiKey = await getSetting('gemini_api_key') || process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY가 설정되지 않았습니다 (관리자 설정 또는 환경변수 확인)')
    }
    _genAI = new GoogleGenerativeAI(apiKey)
  }
  return _genAI
}

function resetGenAI() {
  _genAI = null
}

export { resetGenAI as resetGeminiLLMClient }

export const geminiAdapter: LLMClient = {
  async *streamChat({ systemPrompt, messages, model = 'gemini-2.5-flash-lite' }) {
    const genAI = await getGenAI()
    const generativeModel = genAI.getGenerativeModel({ 
      model,
      systemInstruction: systemPrompt || undefined
    })

    const chat = generativeModel.startChat({
      history: messages.slice(0, -1).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      })),
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      }
    })

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('마지막 메시지는 user 역할이어야 합니다')
    }

    const result = await chat.sendMessageStream(lastMessage.content)

    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) yield text
    }
  }
}