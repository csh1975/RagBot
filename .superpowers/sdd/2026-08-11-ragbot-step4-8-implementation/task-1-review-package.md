# Task 1 Review Package

## Brief
Task 1: Add error_message column to documents table

## Files Changed
1. `ragbot/supabase/migrations/007_add_error_message_column.sql` (NEW)
2. `ragbot/src/app/api/process-document/route.ts` (MODIFIED)

## Diff Summary
- Added migration file to add `error_message` column to `documents` table
- Updated catch block in `processDocumentAsync` to store error message

## Full Diff

### ragbot/supabase/migrations/007_add_error_message_column.sql (NEW)
```sql
-- 007_add_error_message_column.sql
-- documents 테이블에 error_message 컬럼 추가 (실패 사유 기록용)

alter table public.documents
add column if not exists error_message text;

-- 코멘트 추가
comment on column public.documents.error_message is '문서 처리 실패 시 에러 메시지 저장';
```

### ragbot/src/app/api/process-document/route.ts (MODIFIED - lines 277-290)
```typescript
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
```

## Build Result
- `npm run build`: PASSED (TypeScript compiles cleanly)

## Implementer Report
- Status: DONE
- Migration file created
- Route updated with error_message
- Could not run `npx supabase db reset` locally (Docker not installed)
- Migration file is ready but unapplied