# AGENTS.md

이 문서는 opencode가 이 저장소에서 작업할 때 항상 따라야 할 프로젝트 규칙과 컨텍스트입니다.

## 프로젝트 개요

사내(대전교육연수원) 문서 기반 RAG 챗봇 서비스. 관리자가 문서(PDF, HWPX 등)를 업로드하면 자동으로 텍스트 추출 → 청킹 → 임베딩 → DB 저장까지 처리되고, 사용자는 챗봇을 통해 해당 문서 내용을 근거로 질의응답한다. Vercel에 배포한다.

## 기술 스택 (변경 금지, 다른 라이브러리로 임의 대체하지 말 것)

- Next.js 14 (App Router) + TypeScript
- 배포: Vercel (서버리스 함수 실행시간 제한을 항상 고려할 것)
- DB: Supabase (PostgreSQL + pgvector 확장) — 문서 메타데이터, 청크, 임베딩, 사용자/권한을 한 DB에서 관리
- 인증: Supabase Auth, RLS로 관리자(admin)/일반 사용자(user) 권한 분리
- 임베딩: OpenAI text-embedding-3-large (차원 1536, 스키마와 일치시킬 것)
- LLM: 특정 벤더에 고정하지 않는다 (아래 "LLM 프로바이더 규칙" 참고)
- 스타일: Tailwind CSS

## 폴더 구조 규칙

```
app/                    - Next.js App Router 페이지/API 라우트
  admin/                - 관리자 전용 페이지 (문서 업로드/관리)
  chat/                 - 사용자 챗봇 페이지
  api/                  - Route Handlers
    process-document/   - 문서 파싱/청킹/임베딩 파이프라인
    search/             - 유사도 검색 API
    chat/               - RAG 응답 생성 API
lib/
  supabase/             - Supabase client 유틸 (server.ts, client.ts)
  llm/                  - LLM 어댑터 (프로바이더 무관 인터페이스)
  rag/                  - 청킹, 검색 등 RAG 관련 로직
  parsers/              - PDF/HWPX 등 문서 파서
components/             - UI 컴포넌트
supabase/migrations/    - DB 마이그레이션 SQL, 순서대로 번호 부여
```

새 파일을 만들 때는 반드시 이 구조를 따르고, 임의로 새로운 최상위 폴더를 만들지 말 것.

## LLM 프로바이더 규칙 (중요)

LLM은 특정 벤더(Anthropic, OpenAI 등)에 하드코딩하지 않는다. 다음 환경변수로 런타임에 프로바이더를 선택한다:

- `LLM_PROVIDER`: "anthropic" | "openai" | "custom"
- `LLM_API_KEY`: 선택한 프로바이더의 API 키
- `LLM_MODEL`: 모델명 (예: claude-sonnet-4-6, gpt-4o 등)
- `LLM_BASE_URL`: 선택. OpenAI 호환 API 서버(로컬 LLM 포함)를 쓸 경우의 엔드포인트

`lib/llm/index.ts`의 `getLLMClient()`가 `LLM_PROVIDER` 값에 따라 적절한 어댑터(`lib/llm/anthropic.ts`, `lib/llm/openai.ts`)를 반환한다. 모든 어댑터는 동일한 인터페이스(`streamChat({ systemPrompt, messages, model })`)를 구현해야 하며, `app/api/chat/route.ts` 등 상위 코드는 어떤 프로바이더가 쓰이는지 알지 못한 채 동작해야 한다. 새 기능을 추가할 때 이 인터페이스를 깨지 않도록 주의할 것.

## DB / 스키마 규칙

- 새 테이블/컬럼이 필요하면 반드시 `supabase/migrations/`에 새 SQL 파일을 추가한다 (기존 마이그레이션 파일 직접 수정 금지).
- `document_chunks.embedding`은 `vector(1536)`로 고정되어 있다. 임베딩 모델을 바꿀 경우 차원이 다르면 반드시 마이그레이션으로 컬럼 타입을 조정한다.
- 모든 사용자 대면 테이블에는 RLS를 적용한다. RLS 없이 새 테이블을 만들지 말 것.
- 문서 관련 쓰기(insert/update/delete)는 admin role만 가능해야 한다.

## 청킹 규칙

- chunk_size 800~1000자, overlap 150자 내외.
- 한국어 문서 특성상 문장 단위(마침표, 줄바꿈) 우선 분리를 기본 전략으로 한다.
- 청크 메타데이터에는 원본 문서의 페이지 번호(또는 섹션 정보)를 항상 포함시켜, 답변 시 출처 표시가 가능하도록 한다.

## 문서 파서 규칙

- PDF는 `lib/parsers/pdf.ts`, HWPX는 `lib/parsers/hwpx.ts`로 분리한다.
- 새로운 문서 포맷을 추가할 때도 `lib/parsers/` 아래에 동일한 인터페이스(`parse(fileBuffer) => { text, metadata }`)로 구현한다.

## 보안/권한 규칙

- 관리자 페이지(`app/admin/**`)는 middleware 또는 서버 컴포넌트에서 role 체크를 반드시 거친다.
- API 키, DB 서비스 롤 키 등은 절대 클라이언트 컴포넌트나 응답에 노출하지 않는다.
- 사용자 업로드 파일은 Supabase Storage에만 저장하고, 로컬 파일시스템에 영구 저장하지 않는다 (Vercel 서버리스는 파일시스템이 비영속적임).

## 코드 스타일

- 모든 코드는 TypeScript로 작성하고 `any` 타입 사용을 최소화한다.
- API 응답/에러는 일관된 형식(`{ success, data, error }` 등)을 사용한다.
- 비동기 작업(임베딩 생성, 문서 처리)은 항상 실패 처리와 재시도 로직(exponential backoff)을 포함한다.
- 주석은 한국어로 작성해도 무방하나, 변수/함수명은 영어로 작성한다.

## 하지 말아야 할 것

- LLM 벤더를 코드에 하드코딩하지 말 것 (반드시 `lib/llm/` 어댑터를 통할 것).
- Chroma 등 로컬 파일 기반 벡터 DB를 사용하지 말 것 (Vercel 서버리스 환경과 맞지 않음).
- 마이그레이션 없이 Supabase 대시보드에서 직접 스키마를 변경하지 말 것 (코드로 관리되어야 함).
- 검증되지 않은 사용자 입력을 그대로 SQL이나 프롬프트에 삽입하지 말 것 (SQL 인젝션, 프롬프트 인젝션 방지).

## 테스트/확인 방식

- 각 기능 구현 후, 실제로 로컬에서 동작을 확인하고 결과를 요약해서 보고할 것.
- DB 관련 작업은 완료 후 실제 쿼리 결과를 보여줄 것.
- 이 프로젝트는 단계별(STEP 1~8)로 진행되며, 각 STEP은 이전 STEP의 산출물에 의존한다. 이전 단계에서 만든 구조나 인터페이스를 임의로 변경해야 할 경우 반드시 먼저 이유를 설명할 것.