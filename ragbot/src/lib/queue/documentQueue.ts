import { Client } from '@upstash/qstash'
import { createServiceClient } from '@/lib/supabase/server'
import { processDocumentAsync } from '@/lib/rag/processDocument'

export interface DocumentProcessJob {
  documentId: string
  filePath: string
  mimeType: string
  fileName: string
}

// 런타임에 Client를 생성 (서버리스 환경에서 env var는 호출 시점에 주입됨)
function getQStashClient(): Client {
  const token = process.env.QSTASH_TOKEN
  if (!token) {
    throw new Error('QSTASH_TOKEN 환경변수가 설정되지 않았습니다')
  }
  return new Client({
    token,
    baseUrl: process.env.QSTASH_URL,
  })
}

export async function enqueueDocumentProcess(job: DocumentProcessJob): Promise<string> {
  // publishJSON: 큐 이름이 필요 없는 단일 발행 방식 (fire-and-forget + retries)
  const response = await getQStashClient().publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-document/queue`,
    body: job,
    retries: 3,
    delay: 0,
  })
  return response.messageId
}

export async function processQueueJob(job: DocumentProcessJob): Promise<void> {
  const supabase = createServiceClient()

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('documents')
    .download(job.filePath)

  if (downloadError || !fileData) {
    throw new Error(`File download failed: ${downloadError?.message}`)
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer())
  await processDocumentAsync(job.documentId, fileBuffer, job.fileName, job.mimeType, supabase)
}