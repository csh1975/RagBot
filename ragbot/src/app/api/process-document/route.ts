/**
 * 문서 처리 파이프라인 API
 * POST /api/process-document
 * 
 * 흐름:
 * 1. 파일 업로드 → Supabase Storage 저장
 * 2. 문서 메타데이터 DB 저장 (status: pending)
 * 3. 비동기 처리 시작 (큐 또는 백그라운드)
 * 4. 파싱 → 청킹 → 임베딩 → DB 저장
 * 5. 문서 상태 업데이트 (completed/failed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { enqueueDocumentProcess } from '@/lib/queue/documentQueue'
import { processDocumentAsync } from '@/lib/rag/processDocument'

// Vercel 서버리스 함수 실행시간 제한 (업로드 + 큐 등록)
export const maxDuration = 60

export { processDocumentAsync }

// 파일 크기 제한 (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/hwpx',
  'application/x-hwpx',
]

// UUID 생성
function generateId(): string {
  return crypto.randomUUID()
}

export async function POST(request: NextRequest) {
  try {
    // 인증 확인 (쿠키 기반 클라이언트)
    const userClient = await createClient()
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다' },
        { status: 401 }
      )
    }

    // 관리자 권한 확인
    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: '관리자 권한이 필요합니다' },
        { status: 403 }
      )
    }

    const supabase = createServiceClient()

    // FormData 파싱
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = formData.get('title') as string
    const category = formData.get('category') as string | null

    if (!file || !title) {
      return NextResponse.json(
        { success: false, error: '파일과 제목은 필수입니다' },
        { status: 400 }
      )
    }

    // 파일 검증
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `파일 크기는 ${MAX_FILE_SIZE / 1024 / 1024}MB 이하여야 합니다` },
        { status: 400 }
      )
    }

    const mimeType = file.type || getMimeTypeFromFilename(file.name)
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { success: false, error: '지원하지 않는 파일 형식입니다 (PDF, DOCX, HWPX만 가능)' },
        { status: 400 }
      )
    }

    // 파일 버퍼 읽기
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    // 문서 레코드 생성 (pending 상태)
    const documentId = generateId()
    const fileName = `${documentId}-${file.name}`
    const filePath = `documents/${fileName}`

    // 1. Supabase Storage에 파일 업로드
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('[Process Document] Storage 업로드 실패:', uploadError)
      return NextResponse.json(
        { success: false, error: '파일 업로드 실패' },
        { status: 500 }
      )
    }

    // 2. 문서 메타데이터 DB 저장 (status: pending — 파서 파이프라인이 processing으로 변경)
    const { error: docError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        title,
        file_path: filePath,
        category: category || null,
        uploaded_by: user.id,
        status: 'pending',
      })

    if (docError) {
      // 업로드된 파일 정리
      await supabase.storage.from('documents').remove([filePath])
      console.error('[Process Document] 문서 생성 실패:', docError)
      return NextResponse.json(
        { success: false, error: '문서 생성 실패' },
        { status: 500 }
      )
    }

    // 3. 문서 처리 큐 등록
    //    - 프로덕션(Vercel): Upstash QStash 큐로 처리 → 서버리스 함수 제한과 무관하게
    //      파싱~임베딩까지 오래 걸리는 작업을 안정적으로 수행 (재시도 3회)
    //    - 로컬 개발: QStash dev 모드가 로컬에서 동작하지 않으므로 같은 요청 안에서 직접 처리
    try {
      if (isQueueConfigured()) {
        await enqueueDocumentProcess({
          documentId,
          filePath,
          mimeType,
          fileName: file.name,
        })
      } else {
        await processDocumentAsync(documentId, fileBuffer, file.name, mimeType, supabase)
      }
} catch (enqueueError) {
      console.error('[Process Document] 큐/처리 등록 실패:', enqueueError)
      console.error('[Process Document] 큐/처리 등록 실패 stack:', enqueueError instanceof Error ? enqueueError.stack : 'No stack')
      // 큐 등록 실패 시 문서 상태를 failed로 표시하고 Storage 파일 정리
      // error_message 컬럼이 없을 수 있어 상태 업데이트와 별도 처리
      const errorMessage = enqueueError instanceof Error ? enqueueError.message : 'Unknown error'
      await supabase
        .from('documents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', documentId)
      try {
        await supabase
          .from('documents')
          .update({ error_message: `큐/처리 등록 실패: ${errorMessage}` })
          .eq('id', documentId)
      } catch (colError) {
        console.warn('[Process Document] error_message 업데이트 실패 (컬럼 미적용 가능):', colError)
      }
      await supabase.storage.from('documents').remove([filePath])
      return NextResponse.json(
        { success: false, error: '문서 처리 큐/처리 등록에 실패했습니다: ' + errorMessage },
        { status: 500 }
      )
    }

    const isQueued = isQueueConfigured()
    return NextResponse.json({
      success: true,
      data: {
        documentId,
        title,
        status: isQueued ? 'processing' : 'completed',
        message: isQueued
          ? '문서 처리가 큐에 등록되었습니다. 잠시 후 완료됩니다.'
          : '문서 처리가 완료되었습니다.',
      }
    })

  } catch (error) {
    console.error('[Process Document] 예외 발생:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * QStash 큐 사용 가능 여부
 * - 프로덕션: QSTASH_TOKEN이 설정되어 있고 dev 모드가 아닌 경우 큐 사용
 * - 로컬 개발: QSTASH_DEV=true 또는 토큰 미설정 시 직접 처리 (서버리스 제한과 무관)
 */
function isQueueConfigured(): boolean {
  const token = process.env.QSTASH_TOKEN
  const devMode = process.env.QSTASH_DEV === 'true'
  return Boolean(token && !devMode)
}

/**
 * 파일명에서 MIME 타입 추정
 */
function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'hwpx': return 'application/hwpx'
    default: return 'application/octet-stream'
  }
}