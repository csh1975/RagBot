# RagBot - 대전교육연수원 문서 기반 RAG 챗봇

사내 문서(PDF, DOCX, HWPX)를 업로드하면 자동으로 텍스트 추출 → 청킹 → 임베딩 → 벡터 DB 저장이 처리되고, 사용자는 챗봇을 통해 문서 내용을 근거로 질의응답할 수 있는 서비스입니다.

## 기술 스택

- **Framework:** Next.js (App Router) + TypeScript
- **Database:** Supabase (PostgreSQL + pgvector)
- **Vector Search:** pgvector + cosine similarity (`match_document_chunks` RPC)
- **Embeddings:** OpenAI text-embedding-3-large (1536 dimensions)
- **LLM:** Provider-agnostic (OpenAI, Anthropic, Custom/OpenAI-compatible)
- **Queue:** Upstash QStash (신뢰성 있는 백그라운드 문서 처리)
- **Streaming:** Vercel AI SDK (`useChat` + UI 메시지 스트림)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel

## 폴더 구조

```
src/
├── app/
│   ├── api/
│   │   ├── process-document/
│   │   │   ├── route.ts           # 문서 업로드 + 큐 등록
│   │   │   └── queue/route.ts     # 큐 컨슈머 (QStash 웹훅, 서명 검증)
│   │   ├── search/route.ts        # 유사도 검색 API
│   │   └── chat/route.ts          # RAG 스트리밍 챗봇 API (출처 + 텍스트 스트림)
│   ├── admin/                     # 관리자 전용 페이지 (문서 업로드/관리)
│   ├── chat/page.tsx              # 사용자 챗봇 페이지
│   └── auth/                      # 로그인/회원가입
├── components/chat/               # 챗봇 UI 컴포넌트 (MessageList, MessageInput, SourceCitations)
├── lib/
│   ├── llm/                       # LLM 어댑터 (openai/anthropic/custom, 팩토리 패턴)
│   ├── parsers/                   # PDF/DOCX/HWPX 파서
│   ├── queue/                     # QStash 문서 처리 큐
│   ├── rag/                       # 청킹, 임베딩, 검색, 문서 처리
│   └── supabase/                  # Supabase 클라이언트 (server/client)
└── middleware.ts                  # 인증/권한 미들웨어 (admin 보호)
```

## 로컬 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
# .env.local 파일을 열어 모든 값 채우기
```

필수 환경변수:

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 service role key (클라이언트 노출 금지) |
| `OPENAI_API_KEY` | 임베딩용 (text-embedding-3-large) |
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `custom` |
| `LLM_API_KEY` | 선택한 LLM 프로바이더의 API 키 |
| `LLM_MODEL` | 모델명 (예: `claude-sonnet-4-6`, `gpt-4o`) |
| `LLM_BASE_URL` | (선택) 커스텀/로컬 LLM 엔드포인트 |
| `QSTASH_TOKEN` | Upstash QStash 토큰 |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | QStash 서명 키 |
| `NEXT_PUBLIC_APP_URL` | 앱 URL (`http://localhost:3000`, 배포 후 실제 URL) |

### 3. Supabase 설정

1. Supabase 프로젝트를 생성한다.
2. SQL Editor에서 `supabase/migrations/`의 마이그레이션을 순서대로 실행한다 (001~007).
3. Storage에 `documents` 버킷을 Private으로 생성한다.
4. Storage Policy(마이그레이션 006)가 적용되었는지 확인한다.
5. Authentication > Providers에서 Email Provider를 활성화한다.
6. 관리자 계정 생성 후 `profiles` 테이블에서 해당 사용자의 `role`을 `admin`으로 변경한다.

### 4. Upstash QStash 설정

1. [Upstash Console](https://console.upstash.com/)에서 QStash 토큰을 생성한다.
2. Signing Keys 탭에서 Current/Next 키를 복사한다.
3. `.env.local`에 설정한다.

### 5. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

## 문서 처리 파이프라인

1. 관리자가 `/admin`에서 파일 업로드 (PDF, DOCX, HWPX, 최대 50MB)
2. 파일은 Supabase Storage `documents/`에 저장되고 `documents` 테이블에 `status=processing` 레코드 생성
3. Upstash QStash에 처리 작업 인큐 (`retries: 3`)
4. QStash가 `POST /api/process-document/queue` 웹훅 호출 (서명 검증)
5. 컨슈머가 Storage에서 파일 다운로드 → 파싱 → 청킹(900자/150자 오버랩) → 임베딩 → `document_chunks` 배치 저장
6. `documents.status` → `completed` / `failed` (실패 시 `error_message` 기록)

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/process-document` | 문서 업로드 + 처리 큐 등록 (admin 전용) |
| POST | `/api/process-document/queue` | QStash 웹훅 큐 컨슈머 |
| POST | `/api/search` | 유사도 검색 (REST) |
| POST | `/api/chat` | RAG 스트리밍 챗봇 (AI SDK UI 메시지 스트림) |

## LLM 프로바이더 규칙

LLM은 벤더에 고정하지 않고 `lib/llm/index.ts`의 `getLLMClient()` 팩토리가 `LLM_PROVIDER` 환경변수로 적절한 어댑터를 반환한다. 모든 어댑터는 동일한 `streamChat({ systemPrompt, messages, model })` 인터페이스를 구현한다. 새 프로바이더를 추가할 때는 `lib/llm/`에 같은 인터페이스로 구현한다 (코드에 하드코딩 금지).

## 배포 (Vercel)

### 1. 프로젝트 연결

```bash
npm i -g vercel
vercel login
vercel link
```

### 2. 환경변수 설정

Vercel Dashboard > Settings > Environment Variables에 12개 항목(로컬 섹션 참고)을 모두 등록한다. `NEXT_PUBLIC_APP_URL`은 실제 배포 URL로 설정해야 QStash 웹훅이 도달한다.

### 3. 배포

```bash
vercel --prod
```

### 4. 함수 실행시간 제한

`vercel.json`의 `maxDuration`과 각 route의 `export const maxDuration`으로 서버리스 함수 실행시간을 제한한다:

| 함수 | 제한 |
|------|------|
| `/api/process-document` | 60초 |
| `/api/process-document/queue` | 300초 (문서 처리 전용) |
| `/api/chat` | 60초 |
| `/api/search` | 30초 |

### 5. 배포 후 확인사항

- [ ] `/auth/login` 접근 가능
- [ ] 관리자 로그인 후 `/admin`에서 파일 업로드 가능
- [ ] 업로드 후 문서 상태가 `processing` → `completed`로 변경
- [ ] `/chat`에서 질문 시 스트리밍 응답 + 출처 표시
- [ ] 카테고리 필터 동작

## 문제 해결

### 문서 처리 타임아웃
- `vercel.json` / route의 `maxDuration` 확인 (큐 컨슈머 300초)
- 대용량 파일은 청크 수 증가로 임베딩 시간이 늘어난다 → 배치 크기 조정(`lib/rag/processDocument.ts`) 고려

### 임베딩 Rate Limit
- `lib/rag/embeddings.ts`의 배치 크기(100)와 재시도(exponential backoff) 로직 확인
- OpenAI API 사용량/무료 티어 제한 확인

### QStash 웹훅 실패
- `NEXT_PUBLIC_APP_URL`이 정확한 배포 URL인지 확인
- `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`가 Vercel 환경변수와 일치하는지 확인

### 문서 상태가 `processing`에서 멈춤
- 큐 컨슈머 로그(Vercel Function Logs)에서 처리 실패 사유 확인
- `documents.error_message` 컬럼에 실패 사유가 기록된다

## 라이선스

Internal use only - 대전교육연수원