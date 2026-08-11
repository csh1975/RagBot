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
      .update({ status: 'processing' })
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

    // 3. 임베딩 생성 (배치 처리)
    const chunkTexts = chunks.map(c => c.content)
    const { embeddings, totalTokens } = await createBatchEmbeddings(chunkTexts)

    // 임베딩 검증
    const validEmbeddings = embeddings.filter(e => validateEmbedding(e.embedding))
    if (validEmbeddings.length !== embeddings.length) {
      console.warn(`[Process Document] ${documentId} 일부 임베딩 검증 실패`)
    }

    console.log(`[Process Document] ${documentId} 임베딩 완료: ${validEmbeddings.length}개, 토큰 ${totalTokens}`)

    // 4. 청크 + 임베딩 DB 저장
    const chunkRecords = chunks.map((chunk, idx) => ({
      id: generateId(),
      document_id: documentId,
      content: chunk.content,
      embedding: embeddings[idx]?.embedding || new Array(1536).fill(0),
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

    // 5. 문서 상태 완료로 업데이트
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)

    if (updateError) {
      console.error(`[Process Document] ${documentId} 상태 업데이트 실패:`, updateError)
    }

    const duration = Date.now() - startTime
    console.log(`[Process Document] ${documentId} 처리 완료 (${duration}ms)`)

  } catch (error) {
    console.error(`[Process Document] ${documentId} 처리 실패:`, error)
    
    // 상태: failed, 에러 메시지 저장
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await supabase
      .from('documents')
      .update({
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
  }
}
