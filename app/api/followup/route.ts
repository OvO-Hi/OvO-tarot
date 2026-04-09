import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFollowupPrompt } from '@/lib/prompt-builder'
import type { Tone } from '@/types/tarot'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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

    const prompt = buildFollowupPrompt(originalSituation, originalReading, followupQuestion, tone)

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    const answer = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('[/api/followup] error:', error)
    return NextResponse.json({ error: '답변 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
