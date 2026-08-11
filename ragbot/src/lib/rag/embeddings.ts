/**
 * OpenAI 임베딩 생성 유틸리티
 * - 모델: text-embedding-3-large (1536차원)
 * - 재시도 로직: exponential backoff
 * - 배치 처리 지원
 */

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const EMBEDDING_MODEL = 'text-embedding-3-large'
const EMBEDDING_DIMENSION = 1536
const MAX_BATCH_SIZE = 100  // OpenAI 권장 최대 배치 크기
const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export interface EmbeddingResult {
  embedding: number[]
  index: number
  tokensUsed: number
}

export interface BatchEmbeddingResult {
  embeddings: EmbeddingResult[]
  totalTokens: number
}

/**
 * 지수 백오프로 재시도하며 임베딩 생성
 */
async function createEmbeddingWithRetry(
  input: string | string[],
  attempt: number = 1
): Promise<OpenAI.Embeddings.Embedding[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input,
      encoding_format: 'float',
    })
    return response.data
  } catch (error: unknown) {
    const isRateLimit = error instanceof OpenAI.APIError && error.status === 429
    const isServerError = error instanceof OpenAI.APIError && error.status && error.status >= 500
    const isNetworkError = error instanceof Error && (
      error.name === 'ECONNRESET' || 
      error.name === 'ETIMEDOUT' ||
      error.message.includes('network')
    )

    if (attempt < MAX_RETRIES && (isRateLimit || isServerError || isNetworkError)) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 1000
      console.log(`[Embedding] 재시도 ${attempt}/${MAX_RETRIES} - ${delay.toFixed(0)}ms 후 재시도`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return createEmbeddingWithRetry(input, attempt + 1)
    }

    throw error
  }
}

/**
 * 단일 텍스트 임베딩 생성
 */
export async function createEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('빈 텍스트는 임베딩할 수 없습니다')
  }

  // 텍스트 길이 제한 (8191 tokens ≈ 32000자)
  const truncatedText = text.slice(0, 30000)

  const embeddings = await createEmbeddingWithRetry(truncatedText)
  return embeddings[0].embedding
}

/**
 * 배치 임베딩 생성 (최대 100개씩 분할 처리)
 */
export async function createBatchEmbeddings(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0 }
  }

  const results: EmbeddingResult[] = []
  let totalTokens = 0

  // 배치 단위 처리
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE)
    const batchNumber = Math.floor(i / MAX_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(texts.length / MAX_BATCH_SIZE)

    console.log(`[Embedding] 배치 ${batchNumber}/${totalBatches} 처리 중... (${batch.length}개)`)

    try {
      // 빈 텍스트 필터링
      const validInputs = batch.map((text, idx) => ({
        text: text?.trim() || ' ',
        originalIndex: i + idx
      })).filter(item => item.text.length > 0)

      if (validInputs.length === 0) {
        // 빈 텍스트만 있는 경우 제로 벡터 추가
        for (let j = 0; j < batch.length; j++) {
          results.push({
            embedding: new Array(EMBEDDING_DIMENSION).fill(0),
            index: i + j,
            tokensUsed: 0
          })
        }
        continue
      }

      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: validInputs.map(item => item.text),
        encoding_format: 'float',
      })

      const embeddings = response.data

      // 결과 매핑
      const batchTokens = response.usage?.total_tokens || 0
      for (let j = 0; j < embeddings.length; j++) {
        const originalIndex = validInputs[j].originalIndex
        results.push({
          embedding: embeddings[j].embedding,
          index: originalIndex,
          tokensUsed: Math.floor(batchTokens / embeddings.length) // 균등 분배
        })
      }
      totalTokens += batchTokens

      // 빈 텍스트였던 인덱스에 제로 벡터 채우기
      const validIndices = new Set(validInputs.map(item => item.originalIndex))
      for (let j = 0; j < batch.length; j++) {
        if (!validIndices.has(i + j)) {
          results.push({
            embedding: new Array(EMBEDDING_DIMENSION).fill(0),
            index: i + j,
            tokensUsed: 0
          })
        }
      }

    } catch (error) {
      console.error(`[Embedding] 배치 ${batchNumber} 실패:`, error)
      throw new Error(`임베딩 생성 실패 (배치 ${batchNumber}): ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length)
  }

  // 인덱스 순서대로 정렬
  results.sort((a, b) => a.index - b.index)

  return { embeddings: results, totalTokens }
}

/**
 * 임베딩 차원 검증
 */
export function validateEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length === EMBEDDING_DIMENSION &&
    embedding.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
  )
}

/**
 * 코사인 유사도 계산 (클라이언트 사이드 검증용)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('벡터 차원이 일치하지 않습니다')
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