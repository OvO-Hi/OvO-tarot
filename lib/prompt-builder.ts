import type { TarotCard, Spread, DrawnCard, Tone, Category } from '@/types/tarot'
import { getCardCategoryText } from './tarot-data'

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  'very-gentle': '매우 부드럽고 위로가 되는 말투로. 공감과 따뜻함을 최우선으로. "~해요", "~거예요" 종결어미 사용. 직접적인 부정적 표현 대신 완곡하게.',
  'gentle': '친근하고 다정한 말투로. 편안하게 이야기하듯이. "~해요", "~거예요" 종결어미.',
  'normal': '균형 잡힌 중립적인 말투. 너무 딱딱하지도 너무 가볍지도 않게. "~해요", "~입니다" 혼용.',
  'direct': '솔직하고 직접적인 말투. 완곡한 표현보다 명확하게. "~해요" 종결어미. 불편한 진실도 부드럽게 직접 말함.',
  'very-direct': '매우 직설적인 말투. 꾸밈없이 핵심만. "~해요" 종결어미. 긍정/부정 명확히 구분. 현실적인 조언 중심.',
}

export interface BuildReadingPromptParams {
  situation: string
  tone: Tone
  spread: Spread
  drawnCards: DrawnCard[]
  detectedCategories: Category[]
}

export function buildReadingPrompt(params: BuildReadingPromptParams): string {
  const { situation, tone, spread, drawnCards, detectedCategories } = params

  const cardDescriptions = drawnCards
    .map(({ card, position, isReversed }) => {
      const positionInfo = spread.positions.find((p) => p.position === position)
      const categoryText = getCardCategoryText(card, detectedCategories)
      const direction = isReversed ? '역방향' : '정방향'

      return `
## 포지션 ${position}: ${positionInfo?.meaning ?? ''}
카드: ${card.name_ko} (${direction})
${isReversed ? '⚠️ 역방향: 카드의 에너지가 내부로 향하거나 지연/막힘의 형태로 나타남' : ''}

카드 정보:
${categoryText}

상징 해석: ${card.symbol_interpretation ?? '(없음)'}
`
    })
    .join('\n---\n')

  return `당신은 경험 많은 타로 리더입니다. 아래 정보를 바탕으로 사용자에게 맞춤 타로 리딩을 제공해주세요.

## 말투 지침
${TONE_INSTRUCTIONS[tone]}

## 사용자 상황과 질문
${situation}

## 스프레드: ${spread.name}
카드 수: ${spread.cardCount}장
스프레드 의도: 이 스프레드는 사용자의 상황을 다각도로 분석하기 위해 설계되었습니다.

## 뽑힌 카드들
${cardDescriptions}

## 리딩 작성 지침
1. 각 카드를 해당 포지션의 맥락에서 해석하되, 반드시 사용자의 실제 상황과 연결지을 것
2. 카드들 사이의 흐름과 연결고리를 찾아 종합적 스토리를 만들 것
3. 역방향 카드는 에너지의 내부화, 지연, 막힘, 또는 과장/왜곡으로 해석
4. DB에서 제공된 카테고리 텍스트를 참고하되, 그대로 복사하지 말고 사용자 상황에 맞게 재해석
5. 카테고리 정보가 없는 경우 카드의 전체적인 상징과 에너지로 분석
6. 마지막에 반드시 후속 질문 1개를 제안할 것

## 출력 형식 (반드시 이 마크다운 형식 준수)
\`\`\`
## ✦ 상황 분석

[사용자 상황 2-3문장 요약, 공감하는 표현으로 시작]

---

## ✦ 카드 해설

### [포지션 의미] — [카드 이름] ([정/역방향])
[해당 포지션에서 이 카드가 의미하는 것. 사용자 상황과 구체적으로 연결. 3-5문장]

(각 카드마다 반복)

---

## ✦ 종합 결론

[전체 카드 흐름을 엮은 결론. 4-6문장. 앞으로의 방향성 포함]

---

> **✦ 핵심 조언**  
> [한두 문장의 가장 중요한 메시지]

---

*✦ 추가 질문 제안: [더 깊이 탐구할 수 있는 후속 질문 1개]*
\`\`\`
`
}

export function buildAnalyzePrompt(situation: string): string {
  return `당신은 경험 많은 타로 리더입니다. 사용자의 상황을 분석하고 적합한 타로 스프레드를 설계해주세요.

## 사용자 입력
${situation}

## 분석 지침
1. 상황에서 핵심 주제와 감정을 파악하세요
2. 어떤 카테고리가 관련되는지 판단하세요: love(연애), feelings(마음), reunion(재회), contact(연락), career(직업/진로), health(건강), business(사업), money(금전)
3. 상황에 맞는 스프레드를 설계하세요:
   - 단순 확인/방향성: 3장 (과거-현재-미래)
   - 선택/갈림길 상황: 5장
   - 연애/관계 복잡: 5-7장
   - 진로/커리어: 5장
   - 복잡한 심리 분석: 7장
4. 스프레드 이름은 한국어로 감성적이고 상황에 맞게 지을 것
5. 각 포지션의 의미는 사용자 상황에 맞게 커스터마이징할 것
6. questions는 이 상황을 어떻게 나눠서 볼 것인지 2-3개 핵심 질문으로 정리

## 출력 형식 (반드시 순수 JSON만 출력, 마크다운 코드블록 없이)
{
  "situationSummary": "상황 요약 2-3문장. 공감하는 표현으로.",
  "detectedCategories": ["career", "money"],
  "questions": ["핵심 질문 1", "핵심 질문 2", "핵심 질문 3"],
  "spread": {
    "name": "스프레드 이름",
    "cardCount": 5,
    "positions": [
      { "position": 1, "meaning": "포지션 의미" },
      { "position": 2, "meaning": "포지션 의미" }
    ]
  }
}`
}

export function buildFollowupPrompt(
  originalSituation: string,
  originalReading: string,
  followupQuestion: string,
  tone: Tone
): string {
  return `당신은 타로 리더입니다. 앞서 진행한 리딩의 맥락에서 사용자의 추가 질문에 답해주세요.

## 말투 지침
${TONE_INSTRUCTIONS[tone]}

## 원래 상황
${originalSituation}

## 앞서 진행한 리딩 요약
${originalReading.slice(0, 1500)}...

## 추가 질문
${followupQuestion}

## 지침
- 앞선 카드들의 흐름을 유지하면서 답변
- 새로운 카드를 뽑지 말고, 이미 나온 카드들의 맥락에서 해석
- 3-5문단 분량으로 답변
- 마지막에 간단한 격려 메시지로 마무리`
}
