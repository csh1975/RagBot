import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { processQueueJob } from '@/lib/queue/documentQueue'

export const dynamic = 'force-dynamic'

// 큐 컨슈머는 문서 파싱~임베딩까지 처리하므로 긴 타임아웃 필요
export const maxDuration = 300

function getVerifier() {
  return verifySignatureAppRouter(async (request: NextRequest) => {
    const job = await request.json()
    await processQueueJob(job)
    return NextResponse.json({ success: true })
  }, {
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  })
}

export async function POST(request: NextRequest) {
  const verify = getVerifier()
  return verify(request)
}