# OvO TAROT

Claude AI와 PostgreSQL을 사용하는 개인화 타로 리딩 웹앱입니다. 상황에 맞는 스프레드를 설계하고, 뽑은 카드로 해석을 제공합니다.

**배포:** [https://ovo-tarot.vercel.app](https://ovo-tarot.vercel.app)

---

## 주요 기능

- **비밀번호 접근 제어** — 관리자·일반 사용자 역할로 진입 (서버 검증)
- **시간제 일반 사용자 비밀번호** — 관리자 패널에서 유효 시간(분)을 정해 임시 비밀번호 발급
- **AI 상황 분석 + 맞춤 스프레드** — 입력한 상황·톤을 반영해 스프레드와 질문 흐름 설계
- **다양한 스프레드** — 카드 수에 따른 배치 (1 / 3 / 5 / 6 / 7 / 10장 등)
- **카드 플립** — 뒷면에서 앞면으로 넘기는 플립 애니메이션
- **추가 질문** — 리딩 이후 이어서 질문·답변 (일부 흐름에서 카드 연동)
- **리딩 저장** — 캡처 영역을 독립 HTML로 열어 인쇄·PDF·파일 저장에 활용

---

## 기술 스택

| 구분 | 사용 |
|------|------|
| 프레임워크 | **Next.js 14** (App Router) |
| 언어 | **TypeScript** |
| 스타일 | **Tailwind CSS** |
| 데이터베이스 | **PostgreSQL** ([Neon](https://neon.tech) 등 호환) |
| AI | **Claude API** (Anthropic) |
| 배포 | **Vercel** |

---

## 세팅 순서

### 1. 패키지 설치

```bash
npm install
```

### 2. 환경변수 설정

```bash
cp .env.local.example .env.local
# .env.local을 열어 값을 채웁니다
```

필요한 변수 예시:

- `ANTHROPIC_API_KEY` — [Anthropic Console](https://console.anthropic.com)
- `DATABASE_URL` — Neon 등 PostgreSQL 연결 문자열

인증용 `auth_config` 테이블·초기 비밀번호는 프로젝트의 마이그레이션/시드 스크립트를 따릅니다.

### 3. DB 세팅 + 카드 데이터 시딩

```bash
npm run seed
```

`tarot_cards` 테이블과 78장 카드 데이터가 준비됩니다.

### 4. 개발 서버 실행

```bash
npm run dev
```

### 5. Vercel 배포

```bash
npm i -g vercel
vercel
```

Vercel 대시보드 또는 CLI에서 `ANTHROPIC_API_KEY`, `DATABASE_URL` 등 환경변수를 동일하게 설정합니다.

---

## 폴더 구조 (요약)

```
├── app/
│   ├── page.tsx                 # 메인 UI·플로우
│   ├── layout.tsx
│   └── api/
│       ├── analyze/             # 상황 분석 + 스프레드 설계
│       ├── reading/             # 카드 뽑기 + 리딩 생성
│       ├── followup/            # 추가 질문
│       └── auth/                # 비밀번호 검증·갱신·현재 사용자 비밀번호 조회
├── components/                  # UI 컴포넌트
├── lib/                         # DB, 카드 쿼리, 프롬프트 조립
├── scripts/                     # 시딩 등 스크립트
├── types/                       # 공용 타입
├── CLAUDE.md
└── .cursorrules
```

---

## API 엔드포인트

| 메서드 · 경로 | 역할 |
|---------------|------|
| `POST /api/analyze` | 상황 분석 + 스프레드 설계 |
| `POST /api/reading` | 카드 뽑기 + 리딩 생성 |
| `POST /api/followup` | 추가 질문 답변 |
| `POST /api/auth/verify` | 접근 비밀번호 검증 (관리자/사용자) |
| `POST /api/auth/update` | 관리자 비밀번호 변경·일반 사용자 임시 비밀번호 발급 |
| `GET /api/auth/current-user-password` | 현재 유효한 일반 사용자 비밀번호 조회 (관리 UI용) |
