'use client'

import { useState } from 'react'
import type { Tone } from '@/types/tarot'
import ToneSelector from './ToneSelector'

export interface SituationFormProps {
  /** 폼 제출 시 상황 문장과 톤을 한 번에 넘깁니다 (page에서 API 호출에 사용) */
  onSubmit: (situation: string, tone: string) => void
}

/**
 * 1단계 화면: 톤 선택 + 상황 입력.
 * 기본 톤을 `normal`로 두어 처음 들어온 사용자도 부담 없이 시작할 수 있게 했습니다.
 */
export default function SituationForm({ onSubmit }: SituationFormProps) {
  const [tone, setTone] = useState<Tone>('normal')
  const [situation, setSituation] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = situation.trim()
    if (!trimmed) return
    onSubmit(trimmed, tone)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#f0d0d5] bg-white/60 p-6 shadow-[0_4px_20px_rgba(200,116,138,0.15)] backdrop-blur-sm sm:p-8"
    >
      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-[#6b4c52]">
          <span className="text-[#c8748a]">✦</span> 리딩 톤 선택
        </p>
        <ToneSelector value={tone} onChange={(t) => setTone(t as Tone)} />
      </div>

      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-[#6b4c52]">
          <span className="text-[#c8748a]">✦</span> 상황과 질문을 자세히 알려주세요
        </p>
        <p className="mb-3 text-xs text-[#a07880]">자세할수록 더 정확한 리딩을 받을 수 있어요.</p>
        <textarea
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          rows={6}
          placeholder="예: 현재 직장에서 2년째 일하고 있는데..."
          className="w-full resize-y rounded-2xl border border-[#f0d0d5] bg-[#fffafa] px-4 py-3 text-[#6b4c52] placeholder:text-[#a07880]/70 focus:border-[#c8748a] focus:outline-none focus:ring-2 focus:ring-[#c8748a]/20"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-[#c8748a] to-[#d4956a] px-8 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(200,116,138,0.25)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          상황 분석하기 <span className="text-white/90">✦</span>
        </button>
      </div>
    </form>
  )
}
