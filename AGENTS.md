# 타로 리딩 웹앱 — Codex 지시서

## 프로젝트 개요
사용자가 상황과 질문을 입력하면 AI가 타로 스프레드를 설계하고, 카드를 뽑아 해석해주는 개인화 타로 리딩 웹앱.

## 기술 스택
- **프레임워크**: Next.js 14 (App Router) + TypeScript
- **스타일링**: Tailwind CSS (UI 작업은 Cursor가 담당 — 스타일 직접 건드리지 말 것)
- **DB**: PostgreSQL (`pg` 패키지, `DATABASE_URL` 환경변수)
- **AI**: Anthropic Codex API (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY` 환경변수)
- **배포**: Vercel

## 역할 분담
| 담당 | 작업 범위 |
|------|-----------|
| **Codex (나)** | DB 스키마, API Routes 로직, 프롬프트 빌더, 시딩 스크립트, 배포 설정 |
| **Cursor** | UI 컴포넌트, 스타일링, 애니메이션, html2canvas 저장 기능 |

## 절대 규칙
- `app/` 하위 `.tsx` 파일의 Tailwind 클래스는 수정하지 말 것 (Cursor 담당)
- `components/` 폴더 내 파일도 건드리지 말 것
- 새 API Route 만들 때는 항상 TypeScript strict 모드 준수
- DB 쿼리는 반드시 파라미터화된 쿼리 사용 (SQL injection 방지)
- 환경변수는 `.env.local`에만 저장, 절대 코드에 하드코딩 금지

## 폴더 구조
```
tarot-app/
├── app/
│   ├── page.tsx                  # 메인 페이지 (Cursor 담당)
│   ├── globals.css               # 전역 스타일 (Cursor 담당)
│   └── api/
│       ├── analyze/route.ts      # 상황 분석 + 스프레드 설계
│       ├── reading/route.ts      # 카드 뽑기 + 리딩 생성
│       └── followup/route.ts     # 추가 질문 답변
├── components/                   # UI 컴포넌트 (Cursor 담당)
├── lib/
│   ├── db.ts                     # PostgreSQL 연결
│   ├── tarot-data.ts             # 카드 DB 쿼리 함수
│   └── prompt-builder.ts         # 카드 정보 → 프롬프트 조립
├── scripts/
│   └── seed-cards.ts             # 78장 카드 데이터 시딩
├── types/
│   └── tarot.ts                  # 공용 타입 정의
├── AGENTS.md                     # 이 파일
└── .cursorrules                  # Cursor 지시서
```

## DB 스키마 (tarot_cards 테이블)
```sql
CREATE TABLE IF NOT EXISTS tarot_cards (
  id                   INTEGER PRIMARY KEY,
  name_ko              TEXT NOT NULL,
  core_message         TEXT,
  keywords             TEXT,
  story                TEXT,
  love                 TEXT,
  feelings             TEXT,
  reunion              TEXT,
  contact              TEXT,
  career               TEXT,
  health               TEXT,
  business             TEXT,
  money                TEXT,
  symbol_interpretation TEXT,
  reading_script       TEXT,
  arcana               TEXT NOT NULL DEFAULT 'major',
  suit                 TEXT,
  symbol               TEXT NOT NULL DEFAULT '✦'
);
```

## arcana / suit / symbol 매핑 규칙
- id 0~21: `arcana = 'major'`, suit = NULL
- id 22~35: `arcana = 'minor'`, suit = 'wands'
- id 36~49: `arcana = 'minor'`, suit = 'cups'
- id 50~63: `arcana = 'minor'`, suit = 'swords'
- id 64~77: `arcana = 'minor'`, suit = 'pentacles'

symbol 예시:
- 메이저: "0 ☽" (바보), "I ✦" (마법사), "XIII ✝" (죽음) 등 로마숫자+기호
- 완드: "A ♦" / "2 ♦" ... "K ♦"
- 컵: "A ♡" / "2 ♡" ... "K ♡"
- 검: "A ✕" / "2 ✕" ... "K ✕"
- 펜타클: "A ◈" / "2 ◈" ... "K ◈"

## API 응답 형식

### POST /api/analyze
Request: `{ situation: string, tone: string }`
Response:
```json
{
  "situationSummary": "상황 요약 2-3문장",
  "detectedCategories": ["career", "money"],
  "questions": ["질문1", "질문2", "질문3"],
  "spread": {
    "name": "스프레드 이름",
    "cardCount": 5,
    "positions": [
      { "position": 1, "meaning": "포지션 의미" }
    ]
  }
}
```

### POST /api/reading
Request: `{ situation: string, tone: string, spread: Spread, drawnCards: DrawnCard[] }`
Response: `{ reading: string }` (마크다운 포맷)

### POST /api/followup
Request: `{ originalSituation: string, originalReading: string, followupQuestion: string, tone: string }`
Response: `{ answer: string }`

## 스프레드 선택 기준 (Codex에게 제공하는 가이드라인)
- 단순 확인/yes-no: 3장 (과거-현재-미래)
- 선택/갈림길: 5장
- 연애/관계 복잡한 상황: 7장
- 진로/커리어: 5장
- 복잡한 심리 분석: 7장
- 스프레드 이름은 한국어로 감성적으로 지을 것

## 리딩 출력 포맷 (마크다운)
```
## ✦ 상황 분석

[2-3문장 요약]

---

## ✦ 카드 해설

### [포지션 의미] — [카드 이름] ([정/역방향])
[해당 포지션에서 이 카드가 의미하는 것, 사용자 상황과 연결, 3-5문장]

(각 카드마다 반복)

---

## ✦ 종합 결론

[전체 카드 흐름을 엮은 결론, 4-6문장]

---

> **✦ 핵심 조언**
> [한두 문장의 핵심 메시지]

---

*✦ 추가 질문 제안: [후속 질문 1개]*
```
