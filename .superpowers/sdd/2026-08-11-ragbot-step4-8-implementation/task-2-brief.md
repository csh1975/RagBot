### Task 2: Set up Upstash Redis queue for document processing

**Files:**
- Create: `ragbot/package.json` (add @upstash/redis, @upstash/qstash)
- Create: `ragbot/src/lib/queue/documentQueue.ts`
- Modify: `ragbot/src/app/api/process-document/route.ts` (enqueue instead of fire-and-forget)
- Create: `ragbot/src/app/api/process-document/queue/route.ts` (queue consumer endpoint)

**Interfaces:**
- Consumes: `processDocumentAsync` function, documentId, fileBuffer, mimeType
- Produces: Queue enqueue function, queue consumer API route

- [ ] **Step 1: Install dependencies**

```bash
cd ragbot && npm install @upstash/redis @upstash/qstash
```

- [ ] **Step 2: Create queue utility**

```typescript
// src/lib/queue/documentQueue.ts
import { Queue } from '@upstash/qstash'

export interface DocumentProcessJob {
  documentId: string
  filePath: string  // Storage path to download from
  mimeType: string
  fileName: string
}

const qstash = new Queue({ 
  token: process.env.QSTASH_TOKEN!,
  baseUrl: process.env.QSTASH_URL  // optional, defaults to Upstash
})

export async function enqueueDocumentProcess(job: DocumentProcessJob): Promise<string> {
  const messageId = await qstash.enqueueJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-document/queue`,
    body: job,
    retries: 3,
    delay: 0,
  })
  return messageId
}

export async function processQueueJob(job: DocumentProcessJob): Promise<void> {
  // Download from storage, then call existing processDocumentAsync
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
```

- [ ] **Step 3: Create queue consumer API route**

```typescript
// src/app/api/process-document/queue/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifySignature } from '@upstash/qstash/nextjs'
import { processQueueJob } from '@/lib/queue/documentQueue'

export async function POST(request: NextRequest) {
  try {
    // Verify QStash signature
    const verified = await verifySignature(request, {
      token: process.env.QSTASH_CURRENT_SIGNING_KEY!,
      nextToken: process.env.QSTASH_NEXT_SIGNING_KEY!,
    })
    
    if (!verified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const job = await request.json()
    await processQueueJob(job)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Queue Consumer] Error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Modify process-document route to enqueue**

```typescript
// In route.ts POST handler, replace fire-and-forget (line 150)
// with queue enqueue:

import { enqueueDocumentProcess } from '@/lib/queue/documentQueue'

// After document record created (line 140):
await enqueueDocumentProcess({
  documentId,
  filePath,
  mimeType,
  fileName: file.name,
})

// Remove processDocumentAsync call and import
```

- [ ] **Step 5: Add QStash env vars to .env.local.example**

```
# Upstash QStash (문서 처리 큐용)
QSTASH_TOKEN=your_qstash_token
QSTASH_CURRENT_SIGNING_KEY=your_current_signing_key
QSTASH_NEXT_SIGNING_KEY=your_next_signing_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 6: Verify build and local queue test**

```bash
cd ragbot && npm run build
```
Expected: Build passes