import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/nextjs'
import { processQueueJob } from '@/lib/queue/documentQueue'

export const dynamic = 'force-dynamic'

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