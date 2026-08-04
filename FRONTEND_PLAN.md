# Frontend 개발 계획서 (현행화)

> 최종 업데이트: 2026-06-23  
> 분석 대상: public-server + public-front 전체 소스

---

## 1. 전체 현황 요약

서버에 개발된 모든 기능에 대한 프런트 코드가 **이미 구현 완료**되어 있습니다.  
이 문서는 실제 서버와 연결해 통합 테스트를 진행하기 위한 **단계별 실행 계획**입니다.

### 구현 완료 목록

| 기능 | 파일 | 서버 | 상태 |
|------|------|------|------|
| 게임 유저 로그인 | `Login.tsx` + `api/client.ts` | Gateway:3000 | ✅ |
| 게임 유저 정보 조회 | `AuthContext.tsx` + `api/client.ts` | Gateway:3000 | ✅ |
| 메일 발송 | `Profile.tsx` | Gateway:3000 | ✅ |
| 결제 생성 | `Payment.tsx` + `api/payment.ts` | Gateway:3000 | ✅ |
| 결제 조회 | `api/payment.ts` (`getPayment`) | Gateway:3000 | ✅ API만, UI 미노출 |
| 실시간 채팅 (WebSocket) | `ChatRoom.tsx` | Gateway:3000 | ✅ |
| 문서 업로드/조회/삭제 | `AiService.tsx` + `api/ai.ts` | AI:3004 | ✅ |
| AI Q&A 스트리밍 (SSE) | `AiService.tsx` + `api/ai.ts` | AI:3004 | ✅ |
| 어드민 회원가입/로그인 | `AdminLogin.tsx` + `api/admin.ts` | Identity:3001 | ✅ |
| 어드민 유저 관리 | `UserManagement.tsx` | Identity:3001 | ✅ |
| 프롬프트 관리 | `PromptManagement.tsx` + `api/aiAdmin.ts` | AI:3004 | ✅ |
| LLM 비용 모니터링 | `LlmMonitor.tsx` + `api/aiAdmin.ts` | AI:3004 | ✅ |
| Circuit Breaker 상태 | `LlmMonitor.tsx` | AI:3004 | ✅ (필드명 불일치 확인 필요) |
| Groq 채팅 완성 | `GroqService.tsx` + `api/admin.ts` | Identity:3001 | ✅ |
| Groq 임베딩 | `GroqService.tsx` + `api/admin.ts` | Identity:3001 | ✅ |
| 큐 작업 추가 | `QueuePanel.tsx` + `api/admin.ts` | Identity:3001 | ✅ |

### 잠재적 이슈 (테스트 전 확인 필요)

| # | 이슈 | 위치 | 심각도 |
|---|------|------|--------|
| 1 | CircuitBreaker 필드명 불일치 가능성 | `LlmMonitor.tsx` vs 서버 응답 | 중 |
| 2 | Payment GET UI 미노출 | `api/payment.ts`에 함수 있으나 `Payment.tsx`에 UI 없음 | 낮음 |
| 3 | CORS 설정 없음 | `vite.config.ts`에 proxy 없음, 서버 CORS 확인 필요 | 높음 |
| 4 | 환경변수 파일 없음 | `.env` 파일 부재, 기본값(localhost)으로 동작 | 중 |

---

## 2. 서버 아키텍처

### 서비스 포트 구성

```
프런트 (Vite:5173)
    │
    ├── Gateway (3000)         ← 게임 유저 기능 (REST + WebSocket)
    │       │
    │       ├── gRPC → Identity (50051)
    │       ├── gRPC → Payment (50052)
    │       └── gRPC → ChatService (50053)
    │
    ├── Identity (3001)        ← 어드민 Auth, Groq, Queue (REST)
    │
    └── AI Service (3004)      ← Knowledge, QA, Prompts, LLM (REST + SSE)
```

### 의존 인프라

| 서비스 | 포트 | 용도 |
|--------|------|------|
| MySQL | 3306 | 유저/결제 데이터 |
| Redis | 6379 | 세션, Bull Queue, Socket.io Adapter |
| MongoDB | 27017 | AI 벡터 저장소 (Atlas Local) |

---

## 3. 환경 설정

### 3-1. 서버 환경변수 (.env — public-server/docker/)

서버 실행 시 필요한 최소 환경변수:

```dotenv
# DB
DB_USER=root
DB_USER_PW=yourpassword
MYSQL_ROOT_PASSWORD=yourpassword

# MongoDB
MONGO_ROOT_USERNAME=root
MONGO_ROOT_PASSWORD=yourpassword

# JWT
ACCESS_TOKEN_SECRET=your-access-secret-32chars-minimum
REFRESH_TOKEN_SECRET=your-refresh-secret-32chars-minimum

# LLM
GROQ_API_KEY=gsk_xxxxxxxxxxxx
LLM_PROVIDER=groq          # or: ollama, anthropic, openai
EMBEDDING_PROVIDER=groq    # or: ollama, openai

# 선택 (LLM 폴백 체인용)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_EMBEDDING_MODEL=bge-m3
```

### 3-2. 프런트 환경변수 (.env — public-front/)

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_AI_API_BASE_URL=http://localhost:3004
VITE_IDENTITY_API_BASE_URL=http://localhost:3001
```

> 파일이 없으면 각 API 클라이언트가 `localhost` 기본값으로 동작합니다.  
> 로컬 개발은 기본값으로 충분하지만, 서버가 다른 호스트에 있으면 반드시 `.env` 생성이 필요합니다.

### 3-3. CORS 설정

서버에 CORS 설정이 없으면 브라우저에서 API 호출 시 차단됩니다.

**서버 측 해결 (권장)** — 각 NestJS 앱의 `main.ts`:
```ts
app.enableCors({
  origin: ['http://localhost:5173'],
  credentials: true,
});
```

**프런트 측 임시 해결** — `vite.config.ts`에 프록시 추가:
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/gateway': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway/, ''),
      },
      '/api/identity': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/identity/, ''),
      },
      '/api/ai': {
        target: 'http://localhost:3004',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ''),
      },
    },
  },
})
```

---

## 4. 서버 실행 방법

### 방법 A: Docker Compose (권장, 전체 스택)

```bash
cd public-server/docker

# 1. .env 파일 생성 (위 3-1 내용 참고)
vi .env

# 2. 전체 스택 실행
docker compose up -d

# 로그 확인
docker compose logs -f gateway
docker compose logs -f identity
docker compose logs -f ai-service
```

**Docker 포트 매핑 주의:**
- Identity: 내부 8080 포트로 기동됨 → 로컬 테스트 시 `VITE_IDENTITY_API_BASE_URL=http://localhost:8080`
- Payment: 내부 8081 포트
- Gateway: 3000 → 그대로 사용 가능
- AI Service: 3004 → 그대로 사용 가능

### 방법 B: 로컬 직접 실행 (개발 모드)

터미널을 각 서비스별로 분리해 실행:

```bash
# 터미널 1 - 인프라 (DB/Redis/MongoDB만 Docker로)
cd public-server/docker
docker compose up -d db redis mongo

# 터미널 2 - Identity 서비스 (포트 3001)
cd public-server
pnpm nest start identity --watch

# 터미널 3 - Payment 서비스 (gRPC :50052)
cd public-server
pnpm nest start payment --watch

# 터미널 4 - ChatService (gRPC :50053)
cd public-server
pnpm nest start chat-service --watch

# 터미널 5 - Gateway (포트 3000)
cd public-server
pnpm nest start gateway --watch

# 터미널 6 - AI Service (포트 3004)
cd public-server
pnpm start:ai-service:dev
```

**실행 순서 중요:** Identity / Payment / ChatService가 먼저 기동되어야 Gateway가 gRPC 연결 가능합니다.

### 방법 C: AI Service만 로컬, 나머지 Docker

```bash
# 인프라 + 백엔드 서비스 Docker 실행
cd public-server/docker
docker compose up -d db redis mongo identity payment chat-service gateway

# AI 서비스만 로컬 개발 모드
cd public-server
pnpm start:ai-service:dev
```

---

## 5. 단계별 통합 테스트 계획

### Phase 0: 환경 점검

**목표**: 서버와 프런트가 통신 가능한 상태인지 확인

```bash
# 인프라 상태 확인
curl http://localhost:3001/health   # Identity 헬스체크
# Gateway / AI Service는 헬스 엔드포인트 없음 → 서버 로그로 확인

# 프런트 개발 서버 시작
cd public-front
pnpm dev   # → http://localhost:5173
```

체크리스트:
- [ ] MySQL 컨테이너 Running (포트 3306)
- [ ] Redis 컨테이너 Running (포트 6379)
- [ ] MongoDB 컨테이너 Running (포트 27017)
- [ ] Identity 서비스 기동 로그 에러 없음
- [ ] Gateway 서비스 기동 로그 에러 없음 (gRPC 연결 로그 확인)
- [ ] AI Service 기동 로그 에러 없음
- [ ] 브라우저에서 `http://localhost:5173` 정상 접근
- [ ] 브라우저 Console에 CORS 에러 없음

---

### Phase 1: 게임 유저 플로우 (Gateway:3000)

**관련 파일**: `Login.tsx`, `Profile.tsx`, `AuthContext.tsx`, `ChatRoom.tsx`, `Payment.tsx`  
**API 클라이언트**: `api/client.ts` (JWT Bearer 자동 첨부)

#### 1-1. 게임 유저 로그인

테스트 절차:
1. `http://localhost:5173` 접속
2. "User Mode" 버튼 확인 (기본값)
3. 게임 유저 ID/PW 입력 후 로그인

예상 요청:
```
POST http://localhost:3000/auth/login
Body: { "id": "gameuser01", "password": "password123" }
응답: { "accessToken": "eyJ...", "uuid": "uuid-value" }
```

체크리스트:
- [ ] 로그인 성공 → Profile 화면 전환
- [ ] `AuthContext`에 토큰 및 uuid 저장
- [ ] 잘못된 비밀번호 → 에러 메시지 표시

#### 1-2. 유저 정보 조회

로그인 직후 `AuthContext`에서 자동 실행:
```
GET http://localhost:3000/accounts/:uuid
Headers: Authorization: Bearer <token>
```

체크리스트:
- [ ] Profile 화면에 유저 정보 표시
- [ ] 토큰 만료 시 로그아웃 처리

#### 1-3. 메일 발송

```
POST http://localhost:3000/mails
Headers: Authorization: Bearer <token>
```

체크리스트:
- [ ] 메일 발송 버튼 동작
- [ ] 성공/실패 피드백 표시

#### 1-4. 결제 생성

```
POST http://localhost:3000/payments
Headers: Authorization: Bearer <token>
Body: { "amount": 1000, "currency": "KRW", "productId": "prod-001" }
응답: { "paymentId": 1, "accountId": 1, "amount": 1000, ... }
```

체크리스트:
- [ ] 결제 폼 입력 → 제출 동작
- [ ] 성공 응답의 `paymentId` 화면 표시

#### 1-5. 실시간 채팅 (WebSocket + Socket.IO)

```
ws://localhost:3000  (Socket.IO)
```

체크리스트:
- [ ] 채팅방 입장 성공
- [ ] 메시지 전송 → 수신 확인
- [ ] 다중 탭 열어 실시간 수신 확인
- [ ] 채팅방 퇴장 정상 처리

---

### Phase 2: AI 서비스 플로우 (AI Service:3004)

**관련 파일**: `AiService.tsx`  
**API 클라이언트**: `api/ai.ts`

#### 2-1. 문서 관리

**문서 업로드**:
```
POST http://localhost:3004/knowledge/documents
Content-Type: multipart/form-data
Body: file=<업로드파일>
응답: 202 Accepted (비동기 처리)
```

체크리스트:
- [ ] PDF/텍스트 파일 선택 → 업로드 성공
- [ ] 업로드 후 문서 목록 갱신
- [ ] 문서 삭제 → 목록에서 제거

#### 2-2. AI Q&A 스트리밍 (SSE)

```
POST http://localhost:3004/qa/ask
Body: { "question": "테스트 질문입니다" }
응답: SSE 스트림
  data: {"text": "응답 텍스트 조각"}
  data: [DONE]
```

체크리스트:
- [ ] 질문 입력 → 전송
- [ ] 스트리밍 응답이 UI에 점진적으로 표시
- [ ] `[DONE]` 수신 후 완료 상태 전환
- [ ] PromptInjectionGuard 차단 시 에러 메시지 표시

> **주의**: 서버 SSE 응답 형식을 실제로 확인해야 합니다.  
> 클라이언트(`api/ai.ts`)는 `data: {"text":"..."}` 형식을 기대합니다.  
> 서버 실제 응답 형식이 다를 경우 `api/ai.ts`의 파서 수정 필요합니다.

---

### Phase 3: 어드민 패널 (Identity:3001 + AI:3004)

**관련 파일**: `AdminPanel.tsx`, `AdminLogin.tsx`, `UserManagement.tsx`,  
`PromptManagement.tsx`, `LlmMonitor.tsx`, `GroqService.tsx`, `QueuePanel.tsx`

앱 우측 상단 "Admin Mode" 버튼으로 전환

#### 3-1. 어드민 회원가입 / 로그인

```
POST http://localhost:3001/auth/signup
Body: { "email": "admin@test.com", "password": "Admin1234!" }

POST http://localhost:3001/auth/login
Body: { "email": "admin@test.com", "password": "Admin1234!" }
응답: { "accessToken": "eyJ..." }
```

체크리스트:
- [ ] 최초 어드민 계정 생성 성공
- [ ] 로그인 성공 → 탭 패널 표시
- [ ] 헤더에 이메일 + Role 표시
- [ ] 중복 이메일 회원가입 시 에러 표시

#### 3-2. 유저 관리 (users 탭)

```
GET    http://localhost:3001/user?page=1&limit=10
GET    http://localhost:3001/user/:id
PUT    http://localhost:3001/user/activate    Body: { "userId": 1, "isActive": true }
PUT    http://localhost:3001/user/role        Body: { "userId": 1, "role": "admin" }
POST   http://localhost:3001/user/change/password
DELETE http://localhost:3001/user/:id
```

체크리스트:
- [ ] 유저 목록 페이지네이션 동작 (PageMeta 기반)
- [ ] 유저 상세 모달 정상 표시
- [ ] 활성화/비활성화 토글
- [ ] 권한 변경 드롭다운
- [ ] 비밀번호 변경 모달
- [ ] 유저 삭제 확인 후 제거

#### 3-3. 프롬프트 관리 (prompts 탭)

```
POST  http://localhost:3004/prompts
GET   http://localhost:3004/prompts/:name
GET   http://localhost:3004/prompts/:name/active
PATCH http://localhost:3004/prompts/:name/:version/activate
```

체크리스트:
- [ ] 프롬프트 이름으로 검색 → 버전 목록 표시
- [ ] 새 프롬프트 생성 폼 제출
- [ ] 특정 버전 "활성화" 버튼 동작
- [ ] 활성 버전 배지/표시 갱신

#### 3-4. LLM 모니터링 (llm 탭)

```
GET http://localhost:3004/llm-gateway/costs?from=2026-01-01&to=2026-12-31
GET http://localhost:3004/llm-gateway/breakers
```

체크리스트:
- [ ] LLM 비용 데이터 카드 표시 (총 비용, 총 토큰)
- [ ] 모델별 비용 테이블 표시
- [ ] Circuit Breaker 상태 카드 (CLOSED=녹색, OPEN=빨강, HALF_OPEN=주황)

> **필드명 불일치 확인 필요**:  
> 프런트 `CircuitBreaker` 인터페이스: `state`, `failureCount`, `lastFailureTime`  
> 서버 응답 예상: `status`, `failureCount`, `openedAt`  
> 서버 실제 응답 확인 후 `api/aiAdmin.ts`의 인터페이스 수정 필요합니다.

#### 3-5. Groq 서비스 (groq 탭)

```
POST http://localhost:3001/chat/completion
Body: { "messages": [{ "role": "user", "content": "안녕하세요" }] }

POST http://localhost:3001/chat/embedding
Body: { "text": "임베딩할 텍스트" }
```

체크리스트:
- [ ] 채팅 UI에 메시지 전송 → 응답 수신
- [ ] Enter 키로 전송 동작
- [ ] 임베딩 텍스트 입력 → 벡터 차원수 + 앞 20개 값 표시

#### 3-6. 큐 관리 (queue 탭)

```
POST http://localhost:3001/queue/add
Body: { "type": "email", "payload": { "to": "test@test.com" } }
```

체크리스트:
- [ ] 작업 타입 입력
- [ ] JSON 페이로드 입력
- [ ] 제출 후 제출 이력 목록에 추가

---

## 6. API 전체 인벤토리

| 서비스 | 메서드 | 엔드포인트 | 인증 | 프런트 파일 |
|--------|--------|-----------|------|------------|
| Gateway:3000 | POST | /auth/login | 없음 | `api/client.ts` |
| Gateway:3000 | GET | /accounts/:uuid | JWT | `api/client.ts` |
| Gateway:3000 | POST | /mails | JWT | `Profile.tsx` |
| Gateway:3000 | POST | /payments | JWT | `api/payment.ts` |
| Gateway:3000 | GET | /payments/:id | JWT | `api/payment.ts` (UI 미노출) |
| Gateway:3000 | WS | / | JWT | `ChatRoom.tsx` |
| Identity:3001 | POST | /auth/signup | 없음 | `api/admin.ts` |
| Identity:3001 | POST | /auth/login | 없음 | `api/admin.ts` |
| Identity:3001 | GET | /user | JWT | `api/admin.ts` |
| Identity:3001 | GET | /user/:id | JWT | `api/admin.ts` |
| Identity:3001 | PUT | /user/activate | JWT | `api/admin.ts` |
| Identity:3001 | PUT | /user/role | JWT | `api/admin.ts` |
| Identity:3001 | POST | /user/change/password | JWT | `api/admin.ts` |
| Identity:3001 | DELETE | /user/:id | JWT | `api/admin.ts` |
| Identity:3001 | POST | /chat/completion | 없음 | `api/admin.ts` |
| Identity:3001 | POST | /chat/embedding | 없음 | `api/admin.ts` |
| Identity:3001 | POST | /queue/add | 없음 | `api/admin.ts` |
| AI:3004 | POST | /knowledge/documents | 없음 | `api/ai.ts` |
| AI:3004 | GET | /knowledge/documents | 없음 | `api/ai.ts` |
| AI:3004 | GET | /knowledge/documents/:id | 없음 | `api/ai.ts` |
| AI:3004 | DELETE | /knowledge/documents/:id | 없음 | `api/ai.ts` |
| AI:3004 | POST | /qa/ask | 없음 | `api/ai.ts` (SSE) |
| AI:3004 | POST | /prompts | 없음 | `api/aiAdmin.ts` |
| AI:3004 | GET | /prompts/:name | 없음 | `api/aiAdmin.ts` |
| AI:3004 | GET | /prompts/:name/active | 없음 | `api/aiAdmin.ts` |
| AI:3004 | PATCH | /prompts/:name/:version/activate | 없음 | `api/aiAdmin.ts` |
| AI:3004 | GET | /llm-gateway/costs | 없음 | `api/aiAdmin.ts` |
| AI:3004 | GET | /llm-gateway/breakers | 없음 | `api/aiAdmin.ts` |

---

## 7. 알려진 이슈 및 수정 계획

### 이슈 1: CircuitBreaker 인터페이스 필드명

**위치**: `public-front/src/api/aiAdmin.ts`

```ts
// 현재 프런트 정의
interface CircuitBreaker {
  name: string;
  state: string;           // ← 서버가 'status'를 반환하면 수정 필요
  failureCount: number;
  lastFailureTime: string; // ← 서버가 'openedAt'을 반환하면 수정 필요
}
```

**확인**: 서버 기동 후 `GET /llm-gateway/breakers` 실제 응답 JSON 확인  
**수정**: 필드명이 다르면 `aiAdmin.ts` 인터페이스 수정

### 이슈 2: Payment 조회 UI 미노출

**위치**: `public-front/src/components/Payment.tsx`

`api/payment.ts`에 `getPayment(paymentId)` 함수가 있으나 UI에서 호출하지 않음.  
결제 생성 후 반환된 `paymentId`로 조회하는 버튼을 `Payment.tsx`에 추가하면 완성됩니다.

### 이슈 3: SSE 응답 형식 검증

**위치**: `public-front/src/api/ai.ts`

클라이언트가 기대하는 SSE 형식:
```
data: {"text": "응답 조각"}
data: [DONE]
```

서버 `qa.controller.ts`의 실제 이벤트 이름/데이터 형식 확인 후  
`ai.ts`의 스트림 파서 로직을 맞춰 수정해야 할 수 있습니다.

---

## 8. 기술 스택

| 구분 | 기술 |
|------|------|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| HTTP Client | Axios (JWT 인터셉터 포함) |
| Streaming | Fetch API (SSE) |
| WebSocket | socket.io-client |
| Test | Vitest + @testing-library/react |

## 9. 서버 스크립트 참조

```bash
# 개발 모드 실행
pnpm nest start identity --watch
pnpm nest start payment --watch
pnpm nest start chat-service --watch
pnpm nest start gateway --watch
pnpm start:ai-service:dev

# 서버 빌드
pnpm build:identity
pnpm build:payment
pnpm build:gateway
pnpm build:chat-service
pnpm build:ai-service

# 단위 테스트
pnpm test:identity
pnpm test:payment
pnpm test:gateway
pnpm test:ai

# Docker 전체
pnpm docker:up
pnpm docker:down
```
