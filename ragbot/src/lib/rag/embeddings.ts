/**
 * Google Gemini 임베딩 생성 유틸리티 (REST API 직접 호출)
 * - 모델: gemini-embedding-001 (3072차원)
 * - 재시도 로직: exponential backoff
 * - 배치 처리 지원
 * - 일부 배치 실패 시 전체를 실패 처리하지 않고 실패 인덱스만 반환 (부분 실패 허용)
 */

import { getSetting } from '@/lib/config/settings'

const EMBEDDING_MODEL = 'gemini-embedding-001'
const EMBEDDING_DIMENSION = 3072
const MAX_BATCH_SIZE = 100
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

interface EmbeddingResponse {
  embedding: {
    values: number[]
  }
}

export interface EmbeddingResult {
  embedding: number[]
  index: number
  tokensUsed: number
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
  failedIndices: number[]
}

async function getApiKey(): Promise<string> {
  const apiKey = await getSetting('gemini_api_key') || process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY가 설정되지 않았습니다 (관리자 설정 또는 환경변수 확인)')
  }
  console.log('[Embedding] Using API key:', apiKey.slice(0, 10) + '...')
  return apiKey
}

async function createEmbeddingWithRetry(
  input: string | string[],
  attempt: number = 1
): Promise<{ data: number[][]; totalTokens: number }> {
  try {
    const apiKey = await getApiKey()
    const texts = Array.isArray(input) ? input : [input]
    const embeddings: number[][] = []
    let totalTokens = 0

    for (const text of texts) {
      const response = await fetch(
        `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_DOCUMENT',
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'no response body')
        throw new Error(`Gemini 임베딩 API 오류 (${response.status}): ${errorText}`)
      }

      const result: EmbeddingResponse = await response.json()
      const embeddingLen = result.embedding.values.length
      embeddings.push(result.embedding.values)
      totalTokens += Math.ceil(text.length / 4)
    }

    return { data: embeddings, totalTokens }
  } catch (error: unknown) {
    const isRateLimit = error instanceof Error && error.message.includes('429')
    const isServerError = error instanceof Error && (error.message.includes('500') || error.message.includes('503'))
    const isNetworkError = error instanceof Error && (
      error.name === 'ECONNRESET' ||
      error.name === 'ETIMEDOUT' ||
      error.message.includes('network') ||
      error.message.includes('fetch')
    )

    if (attempt < MAX_RETRIES && (isRateLimit || isServerError || isNetworkError)) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000
      await new Promise(resolve => setTimeout(resolve, delay))
      return createEmbeddingWithRetry(input, attempt + 1)
    }

    throw error
  }
}

export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('빈 �����스트는 임베딩할 수 없습니다')
  }

  const truncatedText = text.slice(0, 30000)
  const { data } = await createEmbeddingWithRetry(truncatedText)
  return data[0]
}

export async function createBatchEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, failedIndices: [] }
  }

  const results: EmbeddingResult[] = []
  const failedIndices: number[] = []
  let totalTokens = 0

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)
    const batchNumber = Math.floor(i / MAX_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(texts.length / MAX_BATCH_SIZE)

    console.log(`[Embedding] 배치 ${batchNumber}/${totalBatches} 처리 중... (${batch.length}개)`)

    const validInputs = batch
      .map((text, idx) => ({ text: text?.trim() || ' ', originalIndex: i + idx }))
      .filter(item => item.text.length > 0)

    if (validInputs.length === 0) {
      for (let j = 0; j < batch.length; j++) {
        results.push({ embedding: new Array(EMBEDDING_DIMENSION).fill(0), index: i + j, tokensUsed: 0 })
      }
      onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length)
      continue
    }

    try {
      const { data: embeddings, totalTokens: batchTokens } = await createEmbeddingWithRetry(validInputs.map(item => item.text))

      const validIndices = new Set(validInputs.map(item => item.originalIndex))

      for (let j = 0; j < embeddings.length; j++) {
        results.push({
          embedding: embeddings[j],
          index: validInputs[j].originalIndex,
          tokensUsed: Math.floor(batchTokens / Math.max(embeddings.length, 1)),
        })
      }
      totalTokens += batchTokens

      for (let j = 0; j < batch.length; j++) {
        if (!validIndices.has(i + j)) {
          results.push({ embedding: new Array(EMBEDDING_DIMENSION).fill(0), index: i + j, tokensUsed: 0 })
        }
      }
    } catch (error) {
      console.error(`[Embedding] 배치 ${batchNumber}/${totalBatches} 실패 (건너��):`, error)
      for (let j = 0; j < batch.length; j++) {
        failedIndices.push(i + j)
      }
    }

    onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length)
  }

  results.sort((a, b) => a.index - b.index)

  return { embeddings: results, totalTokens, failedIndices }
}

export function validateEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === EMBEDDING_DIMENSION &&
    embedding.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
  )
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('��터 차원이 일치하지 않습니다')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSION }