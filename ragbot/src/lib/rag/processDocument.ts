/**
 * 백그라운드 문서 처리 (파싱 → 청킹 → 임베딩 → 저장)
 * 큐 컨슈머에서 호출되며, process-document API 라우트와 공유된다.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { parsePDF } from '@/lib/parsers/pdf'
import { parseHWPX, isHWPXFile } from '@/lib/parsers/hwpx'
import { parseDOCX, isDOCXFile } from '@/lib/parsers/docx'
import { chunkTextWithPages } from '@/lib/rag/chunking'
import { createBatchEmbeddings, validateEmbedding } from '@/lib/rag/embeddings'

// UUID 생성
function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 문서 상태 업데이트 헬퍼
 * - status/updated_at은 핵심 필드이므로 항상 먼저 업데이트한다
 * - error_message/processing_meta는 컬럼 미적용(마이그레이션 미실행) 시 업데이트가 실패할 수 있어
 *   개별 try/catch로 분리해 상태 전이(status)가 실패하지 않도록 보장한다
 */
async function updateDocumentStatus(
  supabase: ReturnType<typeof createServiceClient>,
  documentId: string,
  patch: {
    status: string
    error_message?: string | null
    processing_meta?: Record<string, unknown>
  }
) {
  const { error } = await supabase
    .from('documents')
    .update({ status: patch.status, updated_at: new Date().toISOString() })
    .eq('id', documentId)

  if (error) {
    console.error(`[Process Document] ${documentId} 상태(${patch.status}) 업데이트 실패:`, error)
  }

  if ('error_message' in patch) {
    try {
      await supabase
        .from('documents')
        .update({ error_message: patch.error_message })
        .eq('id', documentId)
    } catch (colError) {
      console.warn(`[Process Document] ${documentId} error_message 업데이트 실패 (컬럼 미적용 가능):`, colError)
    }
  }

  if ('processing_meta' in patch) {
    try {
      await supabase
        .from('documents')
        .update({ processing_meta: patch.processing_meta })
        .eq('id', documentId)
    } catch (colError) {
      console.warn(`[Process Document] ${documentId} processing_meta 업데이트 실패 (컬럼 미적용 가능):`, colError)
    }
  }
}

export async function processDocumentAsync(
  documentId: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  supabase: ReturnType<typeof createServiceClient>
) {
  const startTime = Date.now()
  
  try {
    console.log(`[Process Document] ${documentId} 처리 시작`)

    // 상태: processing
    await supabase
      .from('documents')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', documentId)

    // 1. 문서 파싱
    let parseResult
    if (mimeType === 'application/pdf') {
      parseResult = await parsePDF(fileBuffer)
    } else if (isHWPXFile(fileName, fileBuffer)) {
      parseResult = await parseHWPX(fileBuffer)
    } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || isDOCXFile(fileName, fileBuffer)) {
      parseResult = await parseDOCX(fileBuffer)
    } else {
      throw new Error('지원하지 않는 파일 형식')
    }

    if (!parseResult.text || parseResult.text.trim().length === 0) {
      throw new Error('추출된 텍스트가 없습니다')
    }

    console.log(`[Process Document] ${documentId} 파싱 완료: ${parseResult.metadata.pageCount}페이지, ${parseResult.text.length}자`)

    // 2. 청킹
    const chunks = chunkTextWithPages(parseResult.metadata.pages, {
      chunkSize: 900,
      overlapSize: 150,
    })

    if (chunks.length === 0) {
      throw new Error('청크 생성 실패')
    }

    console.log(`[Process Document] ${documentId} 청킹 완료: ${chunks.length}개 청크`)

    // 3. 임베딩 생성 (배치 처리, 부분 실패 허용)
    const chunkTexts = chunks.map(c => c.content)
    const { embeddings, totalTokens, failedIndices } = await createBatchEmbeddings(chunkTexts)

    // 실패한 청크는 건너뛰고 성공한 청크만 저장 (전체 실패 시에만 처리 실패 처리)
    const failedIndexSet = new Set(failedIndices)
    const successRecords: Array<{ chunk: (typeof chunks)[number]; embedding: number[] }> = []

    for (let idx = 0; idx < chunks.length; idx++) {
      if (failedIndexSet.has(idx)) {
        console.warn(
          `[Process Document] ${documentId} 청크 ${idx} 임베딩 실패 (건너뜀): ` +
          chunks[idx].content.slice(0, 100)
        )
        continue
      }
      const embedding = embeddings.find(e => e.index === idx)?.embedding
      if (!embedding || !validateEmbedding(embedding)) {
        console.warn(`[Process Document] ${documentId} 청크 ${idx} 임베딩 검증 실패 (건너뜀)`)
        continue
      }
      successRecords.push({ chunk: chunks[idx], embedding })
    }

    console.log(
      `[Process Document] ${documentId} 임베딩 완료: ${successRecords.length}/${chunks.length}개, 토큰 ${totalTokens}, 실패 ${failedIndices.length}개`
    )

    if (successRecords.length === 0) {
      throw new Error('임베딩 생성에 모두 실패했습니다')
    }

    // 4. 청크 + 임베딩 DB 저장
    const chunkRecords = successRecords.map(({ chunk, embedding }) => ({
      id: generateId(),
      document_id: documentId,
      content: chunk.content,
      embedding,
      chunk_index: chunk.index,
      metadata: {
        ...chunk.metadata,
        pageNumber: chunk.metadata.pageNumber,
      },
    }))

    // 배치 삽입 (최대 500개씩)
    const BATCH_INSERT_SIZE = 500
    for (let i = 0; i < chunkRecords.length; i += BATCH_INSERT_SIZE) {
      const batch = chunkRecords.slice(i, i + BATCH_INSERT_SIZE)
      const { error: chunkError } = await supabase
        .from('document_chunks')
        .insert(batch)

      if (chunkError) {
        console.error(`[Process Document] ${documentId} 청크 저장 실패 (배치 ${i}):`, chunkError)
        throw new Error(`청크 저장 실패: ${chunkError.message}`)
      }
    }

    // 5. 문서 상태 완료로 업데이트 (일부 청크 실패 시에도 완료 처리)
    //    - 일부 청크 임베딩이 실패한 경우 성공한 청크만으로 문서를 완료 처리한다
    if (failedIndices.length > 0) {
      await updateDocumentStatus(supabase, documentId, {
        status: 'completed',
        error_message: null,
        processing_meta: {
          failedChunkIndices: failedIndices,
          failedAt: new Date().toISOString(),
          partialFailure: true,
        },
      })
    } else {
      await updateDocumentStatus(supabase, documentId, {
        status: 'completed',
        error_message: null,
      })
    }

    const duration = Date.now() - startTime
    console.log(`[Process Document] ${documentId} 처리 완료 (${duration}ms)`)

  } catch (error) {
    console.error(`[Process Document] ${documentId} 처리 실패:`, error)
    
    // 상태: failed, 에러 메시지 저장
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await updateDocumentStatus(supabase, documentId, {
      status: 'failed',
      error_message: errorMessage,
    })
    throw error  // Re-throw so the caller knows it failed
  }
}
