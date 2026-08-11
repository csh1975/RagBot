/**
 * 한국어 문서 청킹 유틸리티
 * - chunk_size: 800~1000자
 * - overlap: 150자 내외
 * - 문장 단위(마침표, 줄바꿈) 우선 분리
 */

export interface ChunkOptions {
  chunkSize?: number      // 기본 900자
  overlapSize?: number    // 기본 150자
}

export interface ChunkResult {
  content: string
  index: number
  metadata: Record<string, unknown>
}

const DEFAULT_CHUNK_SIZE = 900
const DEFAULT_OVERLAP_SIZE = 150

/**
 * 텍스트를 문장 단위로 분할
 * 한국어: 마침표(.), 물음표(?), 느낌표(!), 줄바꿈(\n) 기준
 */
function splitIntoSentences(text: string): string[] {
  // 문장 종결 부호 뒤 공백 또는 줄바꿈으로 분할
  const sentences = text
    .replace(/([.!?])\s+/g, '$1|SPLIT|')
    .replace(/\n+/g, '|SPLIT|')
    .split('|SPLIT|')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  
  return sentences
}

/**
 * 문장들을 청크 크기에 맞춰 그룹화 (오버랩 포함)
 */
function groupSentencesIntoChunks(
  sentences: string[],
  chunkSize: number,
  overlapSize: number
): string[] {
  const chunks: string[] = []
  let currentChunk = ''
  let currentLength = 0
  let sentenceBuffer: string[] = []

  for (const sentence of sentences) {
    const sentenceLength = sentence.length
    
    // 단일 문장이 청크 크기보다 큰 경우 강제 분할
    if (sentenceLength > chunkSize) {
      // 현재 버퍼 비우기
      if (sentenceBuffer.length > 0) {
        chunks.push(sentenceBuffer.join(' '))
        sentenceBuffer = []
      }
      // 긴 문장 강제 분할
      for (let i = 0; i < sentence.length; i += chunkSize - overlapSize) {
        chunks.push(sentence.slice(i, i + chunkSize))
      }
      currentChunk = ''
      currentLength = 0
      continue
    }

    // 현재 청크에 문장 추가 시 크기 초과하면 새 청크 시작
    if (currentLength + sentenceLength + 1 > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      
      // 오버랩: 마지막 몇 개 문장 유지
      const overlapText = getOverlapText(sentenceBuffer, overlapSize)
      sentenceBuffer = overlapText ? [overlapText] : []
      currentChunk = overlapText ? overlapText + ' ' : ''
      currentLength = overlapText ? overlapText.length + 1 : 0
    }

    sentenceBuffer.push(sentence)
    currentChunk += (currentChunk ? ' ' : '') + sentence
    currentLength += sentenceLength + (currentChunk.length > sentenceLength ? 1 : 0)
  }

  // 남은 버퍼 처리
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

/**
 * 오버랩용 텍스트 추출 (마지막 N자 또는 마지막 문장들)
 */
function getOverlapText(sentences: string[], overlapSize: number): string {
  let overlap = ''
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = sentences[i] + (overlap ? ' ' + overlap : '')
    if (candidate.length <= overlapSize) {
      overlap = candidate
    } else {
      break
    }
  }
  return overlap
}

/**
 * 메인 청킹 함수
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): ChunkResult[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const overlapSize = options.overlapSize ?? DEFAULT_OVERLAP_SIZE

  // 전처리: 과도한 공백 정리
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()

  if (cleanedText.length === 0) {
    return []
  }

  // 짧은 텍스트는 그대로 반환
  if (cleanedText.length <= chunkSize) {
    return [{
      content: cleanedText,
      index: 0,
      metadata: { charCount: cleanedText.length }
    }]
  }

  // 문장 분할 후 청킹
  const sentences = splitIntoSentences(cleanedText)
  const chunkTexts = groupSentencesIntoChunks(sentences, chunkSize, overlapSize)

  return chunkTexts.map((content, index) => ({
    content,
    index,
    metadata: {
      charCount: content.length,
      sentenceCount: content.split(/[.!?]\s+/).filter(Boolean).length
    }
  }))
}

/**
 * 페이지/섹션 메타데이터가 있는 텍스트 청킹
 * 파서에서 페이지별 텍스트를 받아 처리할 때 사용
 */
export function chunkTextWithPages(
  pages: Array<{ pageNumber: number; text: string }>,
  options: ChunkOptions = {}
): ChunkResult[] {
  const allChunks: ChunkResult[] = []
  let globalIndex = 0

  for (const page of pages) {
    const pageChunks = chunkText(page.text, options)
    
    for (const chunk of pageChunks) {
      allChunks.push({
        ...chunk,
        index: globalIndex++,
        metadata: {
          ...chunk.metadata,
          pageNumber: page.pageNumber
        }
      })
    }
  }

  return allChunks
}