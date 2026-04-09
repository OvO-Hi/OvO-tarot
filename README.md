# 🔮 타로 리딩 웹앱

개인화 타로 리딩 서비스. Claude AI + PostgreSQL + Next.js 기반.

---

## 세팅 순서

### 1. 패키지 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
cp .env.local.example .env.local
# .env.local 열어서 키 값 채우기
```

필요한 키:
- `ANTHROPIC_API_KEY` → https://console.anthropic.com
- `DATABASE_URL` → https://neon.tech (무료 PostgreSQL)

### 3. DB 세팅 + 카드 데이터 시딩
```bash
npm run seed
```
→ `tarot_cards` 테이블 생성 + 78장 카드 데이터 삽입

### 4. 개발 서버 실행
```bash
npm run dev
```

### 5. Vercel 배포
```bash
# Vercel CLI 설치 (처음 한 번만)
npm i -g vercel

# 배포
vercel

# 환경변수 설정 (Vercel 대시보드 또는 CLI)
vercel env add ANTHROPIC_API_KEY
vercel env add DATABASE_URL
```

---

## 폴더 구조

```
tarot-app/
├── app/
│   ├── page.tsx              # 메인 페이지 (Cursor 담당)
│   └── api/
│       ├── analyze/          # 상황 분석 + 스프레드 설계
│       ├── reading/          # 카드 뽑기 + 리딩 생성
│       └── followup/         # 추가 질문
├── components/               # UI 컴포넌트 (Cursor 담당)
├── lib/
│   ├── db.ts                 # DB 연결
│   ├── tarot-data.ts         # 카드 쿼리 함수
│   └── prompt-builder.ts     # 프롬프트 조립
├── scripts/
│   └── seed-cards.ts         # 카드 데이터 시딩 (78장)
├── types/
│   └── tarot.ts              # 공용 타입
├── CLAUDE.md                 # Claude Code 지시서
└── .cursorrules              # Cursor 지시서
```

---

## 역할 분담

| 도구 | 담당 |
|------|------|
| **Claude Code** | DB, API, 프롬프트 로직 |
| **Cursor** | UI, 스타일, 애니메이션, 저장 기능 |

---

## API 엔드포인트

| 엔드포인트 | 역할 |
|------------|------|
| `POST /api/analyze` | 상황 분석 + 스프레드 설계 |
| `POST /api/reading` | 카드 뽑기 + 리딩 생성 |
| `POST /api/followup` | 추가 질문 답변 |
