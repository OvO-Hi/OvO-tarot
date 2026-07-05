# CV 공개용 비밀번호 — Claude Code 인계서

Cowork sandbox 측에서 일부 파일이 fuse 캐시 문제로 read/write 불가 상태라
Claude Code (호스트 직접 실행) 로 남은 UI 작업을 이어가기 위한 인계서.

---

## 0. 배경 — 무엇을 만들고 있었나

기존 OvO-tarot 사이트는 **(1) 관리자 로그인 / (2) 관리자가 발급한 일회용 6자리
번호 로그인** 두 가지 인증만 있었다.

오리님이 사이트 링크를 CV(이력서)에 제출하면서, 채용 검토자에게 노출할
**제3의 비밀번호 ("CV 공개용 비밀번호")** 가 필요해진 상황.  요구사항:

- 비밀번호는 **본인이 직접 설정** (이미 CV에 한 가지를 적어 제출함 → 그걸 그대로 등록할 수 있어야 함)
- **만료일**을 길게 (1~2개월) 설정 가능. 만료일 그 날 23:59:59 까지 유효, 이후 거부.
- **로그인 한 사람마다 3회 사용 제한** (추가 질문 포함)
  - 단, 비번 자체는 3개 기업 공유 → "비밀번호별 카운트"는 안 됨
  - 추적 단위는 **IP + User-Agent + 쿠키 조합 (viewer_id)**
- 로그인 후 화면 상단에 **남은 횟수** 표시
- 한도 초과 시 새 리딩만 차단 (사이트 진입 자체는 가능 = 읽기 전용 모드)
- 카운트 차감 시점: **리딩 시작 (카드 뽑을 때 = `/api/reading` 호출 시점)**.
  Follow-up / analyze 는 같은 리딩 세션이라 추가 차감 없음.

---

## 1. 이미 끝나 있는 부분 — 그대로 두면 됨

### 새로 만든 파일
- `lib/cv-viewer.ts` — viewer_id 식별, 사용량 조회/증가, cv_auth 쿠키 검증 헬퍼.
- `app/api/auth/cv-password/route.ts` — 관리자가 CV 비번/만료일/한도 설정.
  - `GET` : 현재 설정 상태 (비번 자체는 절대 반환 X)
  - `POST` : `{ adminPassword, newCvPassword?, expiresDate?, maxUsesPerViewer?, resetUsage? }`
- `app/api/auth/cv-usage/route.ts` — `GET` 으로 현재 viewer 의 used / limit / remaining 조회.
- `scripts/migrate-cv-viewer.ts` — 멱등 DB 마이그레이션. `auth_config` 에
  `cv_password_hash`, `cv_password_expires_at`, `cv_max_uses_per_viewer` 키
  보장 + `cv_viewer_usage` 테이블 + `idx_cv_viewer_usage_last_used` 인덱스 생성.

### 수정한 파일
- `app/api/auth/verify/route.ts` — CV 비번 분기 추가, 통과 시 `role: 'cv_viewer'` +
  `usage`, `expiresAt` 반환 + `cv_viewer_id`, `cv_auth` 쿠키 발급.
  admin / user 통과 시 `cv_auth` 쿠키는 명시적으로 클리어.
- `app/api/reading/route.ts` — 호출 시 `getActiveCvViewerSession` 으로 cv_viewer
  여부 판단 → 카운트 +1, 한도 초과 시 `403 { error: 'cv_limit_exceeded', usage }`.

### 데이터 흐름
1. 사용자가 CV 비번 입력 → `POST /api/auth/verify` →
   `{ role: 'cv_viewer', usage: { used, limit, remaining }, expiresAt }`
   응답 + `cv_viewer_id` (HttpOnly, 90일) + `cv_auth` (cv_password_hash prefix 16자) 쿠키 발급.
2. 페이지에서 필요할 때 `GET /api/auth/cv-usage` 로 최신 사용량 조회.
3. 새 리딩 시작 = `POST /api/reading` 호출. 서버가 cv_auth 쿠키 검증 → 카운트
   +1. 한도 초과면 `403 { error: 'cv_limit_exceeded', usage }`.
4. Follow-up / analyze 는 카운트 차감 없음.

---

## 2. 남은 작업 — Claude Code 가 할 것

### 2-1. `components/AdminPanel.tsx` — CV 공개용 비밀번호 관리 섹션 추가

기존 "관리자 비밀번호 변경" 과 "일회용 번호 발급" 섹션 옆에 새 섹션 추가.
디자인 톤은 기존 섹션과 동일하게 (TailwindCSS, 같은 카드/버튼 스타일).

UI 요구사항:
- **현재 상태 카드**:
  - `GET /api/auth/cv-password` 결과로 표시
  - `configured`, `active`, `expiresDate` (YYYY-MM-DD), `maxUsesPerViewer`,
    `totalViewers`, `totalUses`
  - 비밀번호 자체는 표시하지 않음 (보안)
  - active === false 인데 configured === true 이면 "만료됨" 뱃지
- **CV 비밀번호 변경 / 만료일 변경 / 한도 변경 폼**:
  - 모든 변경에는 관리자 비밀번호 입력 필요
  - 입력 필드: `newCvPassword` (선택, 4자 이상),
    `expiresDate` (선택, `<input type="date">`),
    `maxUsesPerViewer` (선택, 1~100),
    `resetUsage` (선택 체크박스 — "기존 viewer 사용 이력 초기화")
  - 셋 중 아무것도 입력 안 했으면 제출 비활성화
  - 제출 → `POST /api/auth/cv-password` →
    성공 시 현재 상태 카드 새로고침, 토스트/알림 "변경되었습니다."
  - 에러 시 응답의 `error` 표시
- 만료일 입력 시 "그날 23:59:59 까지 유효" 보조 텍스트 추가
- (이미 CV에 제출한 비번이 있으므로) 첫 등록 시 친절한 가이드 한 줄 추가:
  "CV에 적은 비밀번호를 그대로 입력하세요."

### 2-2. `components/PasswordGate.tsx` — `cv_viewer` 역할 처리

기존:
```ts
const data = await res.json() // { role: 'admin' | 'user' | null, error? }
onSuccess(data.role)
```

변경:
- role 타입에 `'cv_viewer'` 추가.
- `data.role === 'cv_viewer'` 인 경우, 응답의 `usage` (used / limit / remaining)
  와 `expiresAt` 도 함께 상위로 전달.
- 에러 메시지에 "CV 공개용 비밀번호가 만료되었습니다." 처리.

권장 시그니처:
```ts
type AuthRole = 'admin' | 'user' | 'cv_viewer'
type AuthSuccess =
  | { role: 'admin' }
  | { role: 'user' }
  | { role: 'cv_viewer'; usage: { used: number; limit: number; remaining: number }; expiresAt: number }

onSuccess(payload: AuthSuccess)
```

### 2-3. `app/page.tsx` — 상단 배너 + 카운트 0 차단

- 기존 PasswordGate → 인증 후 메인 화면으로 진입하는 흐름은 그대로.
- `role === 'cv_viewer'` 인 경우, 메인 화면 **상단에 항상 보이는 배너** 추가:
  - "오늘 남은 리딩: **N / M** 회" (남은/한도)
  - 만료일 표시 (예: "유효: 2026-06-30까지")
  - `remaining === 0` 이면 빨간 배너 + "리딩 횟수를 모두 사용했어요." 문구
- `remaining === 0` 일 때:
  - 새 리딩 시작 버튼 비활성화 + 안내 모달/텍스트
  - 이미 본 리딩 결과/페이지는 그대로 볼 수 있음 (읽기 전용 모드)
- `/api/reading` 응답이 `403 { error: 'cv_limit_exceeded', usage }` 인 경우도
  방어적으로 처리 (서버 race) — 배너 카운트 갱신 + 사용자에게 안내.
- 리딩 성공 시 응답에 `cvUsage` (used / limit / remaining) 가 같이 오니
  배너 카운트도 그것으로 갱신.
- 페이지 진입 시 또는 새로고침 시 `GET /api/auth/cv-usage` 로 현재
  카운트 동기화 (배너용).

### 2-4. (정리) 임시 파일 제거

작업 끝나면 락 풀린 김에:
```
rm components/__test_lock_check.tmp
```
(이건 락 진단 중 만들어진 빈 파일.)

---

## 3. 검증 — UI 작업 끝난 뒤 실행

### 3-1. TypeScript 타입 체크
```
npx tsc --noEmit
```
에러 0 인지 확인. 새로 추가된 `cv-viewer.ts`, 새 API 라우트, 그리고 수정된
`verify` / `reading` 의 타입이 다 맞아야 함.

### 3-2. DB 마이그레이션 실행
```
npx tsx scripts/migrate-cv-viewer.ts
```
멱등이라 여러 번 실행해도 안전.

### 3-3. 동작 시나리오 (수동)
1. 관리자 로그인 → AdminPanel → "CV 공개용 비밀번호" 섹션에서 비번/만료일 등록.
2. 시크릿창에서 그 비번으로 로그인 → 상단 배너 "남은 리딩: 3/3" 표시.
3. 리딩 1번 → 배너 "2/3".  Follow-up 2번 → 배너 그대로 "2/3" (차감 안 됨).
4. 리딩 더 진행해서 3번까지 소진 → 배너 "0/3" 빨간색 + 새 리딩 차단.
5. 같은 시크릿창 새로고침 → 여전히 "0/3" (쿠키로 추적 유지).
6. 다른 브라우저/시크릿 + 다른 IP에서 같은 비번 로그인 → 새 viewer_id → 다시 "3/3".
7. 만료일 지난 후 로그인 → "CV 공개용 비밀번호가 만료되었습니다." 거부.

---

## 4. 디자인/스타일 팁

- 기존 컴포넌트들은 TailwindCSS + 카드형 레이아웃. 같은 톤 유지.
- 배너는 `sticky top-0 z-40 bg-amber-50 border-b border-amber-200` 같은
  부드러운 색.  remaining === 0 이면 `bg-rose-50 border-rose-300 text-rose-900`.
- AdminPanel 섹션은 다른 섹션과 동일하게 `<section className="p-4 rounded-xl border ...">` 형태로.
- 한국어 UI. 기존 문구 톤 유지.

---

## 5. 이 인계서를 받은 Claude Code 에게 한 줄 가이드

> "이 문서를 읽고, `2. 남은 작업` 의 4개 항목을 순서대로 처리해줘.
>  완료되면 `npx tsc --noEmit` 결과를 보고해줘."

작업 끝나면 이 인계서 (`CV_VIEWER_HANDOFF.md`) 는 지워도 됨.
