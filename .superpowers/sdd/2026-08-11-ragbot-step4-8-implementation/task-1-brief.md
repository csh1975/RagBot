### Task 1: Add error_message column to documents table

**Files:**
- Create: `ragbot/supabase/migrations/007_add_error_message_column.sql`
- Modify: `ragbot/src/app/api/process-document/route.ts` (update error handling)

**Interfaces:**
- Consumes: existing `documents` table schema
- Produces: `documents.error_message` column (text, nullable)

- [ ] **Step 1: Create migration file**

```sql
-- 007_add_error_message_column.sql
-- documents 테이블에 error_message 컬럼 추가 (실패 사유 기록용)

alter table public.documents
add column if not exists error_message text;

-- 코멘트 추가
comment on column public.documents.error_message is '문서 처리 실패 시 에러 메시지 저장';
```

- [ ] **Step 2: Apply migration locally**

```bash
cd ragbot && npx supabase db reset
```
Expected: Migration runs successfully, column added

- [ ] **Step 3: Update process-document route to use error_message**

```typescript
// In catch block of processDocumentAsync (route.ts:277-287)
await supabase
  .from('documents')
  .update({
    status: 'failed',
    error_message: error instanceof Error ? error.message : 'Unknown error',
    updated_at: new Date().toISOString(),
  })
  .eq('id', documentId)
```

- [ ] **Step 4: Verify build passes**

```bash
cd ragbot && npm run build
```
Expected: TypeScript compiles without errors