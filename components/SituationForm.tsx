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
 * 카드·테두리·그림자 색은 핑크 계열에서 슬레이트 블루 톤으로 맞췄습니다.
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
      className="rounded-2xl border border-[#e0e0e5] bg-white/60 p-6 shadow-[0_4px_20px_rgba(74,111,165,0.12)] backdrop-blur-sm sm:p-8"
    >
      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-[#2c2c2e]">
          <span className="text-[#4a6fa5]">✦</span> 리딩 톤 선택
        </p>
        <ToneSelector value={tone} onChange={(t) => setTone(t as Tone)} />
      </div>

      <div className="mb-8">
        <p className="mb-2 text-sm font-medium text-[#2c2c2e]">
          <span className="text-[#4a6fa5]">✦</span> 상황과 질문을 자세히 알려주세요
        </p>
        <p className="mb-3 text-xs text-[#6e6e73]">자세할수록 더 정확한 리딩을 받을 수 있어요.</p>
        <textarea
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          rows={6}
          placeholder="예: 학교에서 만난 친구가 있는데, 요즘 사이가 멀어져서..."
          className="w-full resize-y rounded-2xl border border-[#e0e0e5] bg-[#ffffff] px-4 py-3 text-[#2c2c2e] placeholder:text-[#6e6e73]/70 focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
        />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] px-8 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(74,111,165,0.22)] transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
        >
          상황 분석하기 <span className="text-white/90">✦</span>
        </button>
      </div>
    </form>
  )
}
