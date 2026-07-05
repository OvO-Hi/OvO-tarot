import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { drawRandomCards, assignReversals } from '@/lib/tarot-data'
import { buildReadingPrompt } from '@/lib/prompt-builder'
import { CLAUDE_MODEL } from '@/lib/config'
import type { Spread, Tone, Category, DrawnCard } from '@/types/tarot'
import {
  getActiveCvViewerSession,
  getCvViewerUsage,
  incrementCvViewerUsage,
} from '@/lib/cv-viewer'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { situation, tone, spread, detectedCategories } = await req.json() as {
      situation: string
      tone: Tone
      spread: Spread
      detectedCategories: Category[]
    }

    // 0. CV viewer 세션이면 사용 횟수 차감 (관리자/일회용 사용자는 차감 없음)
    //    카운트는 (password_id, viewer_id) 페어 단위.
    const cvSession = await getActiveCvViewerSession(req)
    let cvUsageAfter: { used: number; limit: number; remaining: number } | null = null
    if (cvSession) {
      const before = await getCvViewerUsage(
        cvSession.passwordId,
        cvSession.viewerId,
        cvSession.maxUsesPerViewer
      )
      if (before.remaining <= 0) {
        return NextResponse.json(
          {
            error: 'cv_limit_exceeded',
            message: '이 비밀번호로는 리딩 횟수를 모두 사용했습니다.',
            usage: before,
          },
          { status: 403 }
        )
      }
      const inc = await incrementCvViewerUsage(
        cvSession.passwordId,
        cvSession.viewerId,
        cvSession.maxUsesPerViewer
      )
      if (!inc.ok) {
        return NextResponse.json(
          {
            error: 'cv_limit_exceeded',
            message: '이 비밀번호로는 리딩 횟수를 모두 사용했습니다.',
            usage: inc.usage,
          },
          { status: 403 }
        )
      }
      cvUsageAfter = {
        used: inc.usage.used,
        limit: inc.usage.limit,
        remaining: inc.usage.remaining,
      }
    }

    // 1. DB에서 랜덤 카드 뽑기
    const cards = await drawRandomCards(spread.cardCount)
    const cardsWithReversals = assignReversals(cards)

    // 2. DrawnCard 형태로 변환 (포지션 번호 부여)
    const drawnCards: DrawnCard[] = cardsWithReversals.map(({ card, isReversed }, i) => ({
      card,
      position: i + 1,
      isReversed,
    }))

    // 3. 프롬프트 빌드
    const prompt = buildReadingPrompt({
      situation,
      tone,
      spread,
      drawnCards,
      detectedCategories,
    })

    // 4. Claude API 호출
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const reading = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return NextResponse.json({
      reading,
      drawnCards,
      ...(cvUsageAfter ? { cvUsage: cvUsageAfter } : {}),
    })
  } catch (error) {
    console.error('[/api/reading] error:', error)
    return NextResponse.json({ error: '리딩 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
