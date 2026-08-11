-- 006_create_storage_bucket.sql
-- Supabase Storage 'documents' 버킷 생성 및 정책 설정
-- Supabase 대시보드 > Storage에서 직접 생성해도 되지만, 코드로 관리하기 위해 마이그레이션에 포함

-- 버킷 생성 (Storage 버킷은 SQL로 직접 생성 불가, 대시보드 또는 API로 생성 필요)
-- 이 파일은 참고용이며, 실제 버킷 생성은 다음 방법 중 하나로 수행:
-- 1. Supabase 대시보드 > Storage > New bucket > 'documents' 생성 (Public bucket: false)
-- 2. Supabase CLI: supabase storage create documents --public=false
-- 3. Management API 사용

-- 버킷 생성 후 실행할 정책들 (Supabase 대시보드 > Storage > Policies에서 추가 또는 SQL 실행):

-- 정책: 인증된 사용자는 문서 버킷의 파일 목록 조회 가능
create policy "Authenticated users can list documents" on storage.objects
  for select using (
    bucket_id = 'documents' 
    and auth.role() = 'authenticated'
  );

-- 정책: 인증된 사용자는 문서 버킷의 파일 다운로드 가능
create policy "Authenticated users can download documents" on storage.objects
  for select using (
    bucket_id = 'documents' 
    and auth.role() = 'authenticated'
  );

-- 정책: 관리자만 문서 버킷에 파일 업로드 가능
create policy "Admins can upload documents" on storage.objects
  for insert with check (
    bucket_id = 'documents' 
    and exists (
      select 1 from public.profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

-- 정책: 관리자만 문서 버킷의 파일 수정 가능
create policy "Admins can update documents" on storage.objects
  for update using (
    bucket_id = 'documents' 
    and exists (
      select 1 from public.profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

-- 정책: 관리자만 문서 버킷의 파일 삭제 가능
create policy "Admins can delete documents" on storage.objects
  for delete using (
    bucket_id = 'documents' 
    and exists (
      select 1 from public.profiles 
      where id = auth.uid() and role = 'admin'
    )
  );

-- 참고: Storage 버킷은 SQL 마이그레이션으로 직접 생성할 수 없습니다.
-- Supabase 대시보드 또는 Management API를 통해 생성해야 합니다.
-- 생성 시 설정:
-- - Name: documents
-- - Public bucket: false (비공개, 인증된 사용자만 접근)
-- - File size limit: 52428800 (50MB)
-- - Allowed MIME types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/hwpx, application/x-hwpx