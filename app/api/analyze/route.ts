import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildAnalyzePrompt } from '@/lib/prompt-builder'
import { CLAUDE_MODEL } from '@/lib/config'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { situation, tone } = await req.json()

    if (!situation?.trim()) {
      return NextResponse.json({ error: '상황을 입력해주세요.' }, { status: 400 })
    }

    const prompt = buildAnalyzePrompt(situation)

    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // JSON 파싱 (코드블록 있을 경우 제거)
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(cleaned)

    return NextResponse.json(result)
  } catch (error) {
    console.error('[/api/analyze] error:', error)
    return NextResponse.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
