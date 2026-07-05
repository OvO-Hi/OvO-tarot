import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFollowupAnalyzePrompt, buildFollowupPrompt } from '@/lib/prompt-builder'
import { CLAUDE_MODEL } from '@/lib/config'
import { drawRandomCards, assignReversals } from '@/lib/tarot-data'
import type { Tone, Spread, DrawnCard } from '@/types/tarot'

// Vercel 함수 실행 시간 상한 (추가 질문은 Opus 호출을 2번 하므로 60초로 상향)
export const maxDuration = 60

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Claude 응답 텍스트만 이어붙임 */
function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

/** cardCount를 1~10 범위로 보정하고 positions 길이를 맞춘 스프레드 반환 */
function normalizeSpread(spread: Spread): Spread {
  const cardCount = Math.min(10, Math.max(1, Math.round(spread.cardCount || 1)))

  // positions 가 부족하면 채우고, 넘치면 잘라서 cardCount 와 일치시킴
  const positions = Array.from({ length: cardCount }, (_, i) => {
    const existing = spread.positions?.find((p) => p.position === i + 1)
    return {
      position: i + 1,
      meaning: existing?.meaning ?? `추가 질문에 대한 관점 ${i + 1}`,
    }
  })

  return {
    name: spread.name?.trim() || '추가 질문 스프레드',
    cardCount,
    positions,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { originalSituation, originalReading, followupQuestion, tone } = await req.json() as {
      originalSituation: string
      originalReading: string
      followupQuestion: string
      tone: Tone
    }

    if (!followupQuestion?.trim()) {
      return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 })
    }

    // 1. 추가 질문 분석 → 적절한 카드 수/스프레드 결정
    const analyzePrompt = buildFollowupAnalyzePrompt(originalSituation, followupQuestion)
    const analyzeMessage = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: analyzePrompt }],
    })

    const analyzeText = textFromMessage(analyzeMessage)
    const cleaned = analyzeText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let spread: Spread
    try {
      const parsed = JSON.parse(cleaned) as { spread: Spread }
      spread = normalizeSpread(parsed.spread)
    } catch {
      // 분석/파싱 실패 시 기본 3장 스프레드로 폴백
      spread = normalizeSpread({
        name: '추가 질문 3장 스프레드',
        cardCount: 3,
        positions: [
          { position: 1, meaning: '현재 상황' },
          { position: 2, meaning: '핵심 열쇠' },
          { position: 3, meaning: '나아갈 방향' },
        ],
      })
    }

    // 2. 결정된 카드 수만큼 DB에서 카드 뽑기
    const cards = await drawRandomCards(spread.cardCount)
    const cardsWithReversals = assignReversals(cards)
    const drawnCards: DrawnCard[] = cardsWithReversals.map(({ card, isReversed }, i) => ({
      card,
      position: i + 1,
      isReversed,
    }))

    // 3. 뽑은 카드 기반으로 답변 생성
    const prompt = buildFollowupPrompt(
      originalSituation,
      originalReading,
      followupQuestion,
      tone,
      spread,
      drawnCards
    )

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const answer = textFromMessage(message)

    return NextResponse.json({ answer, drawnCards, spread })
  } catch (error) {
    console.error('[/api/followup] error:', error)
    return NextResponse.json({ error: '답변 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
