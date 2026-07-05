'use client'

import type { Tone } from '@/types/tarot'
import { TONE_LABELS } from '@/types/tarot'

const TONES: Tone[] = ['very-gentle', 'gentle', 'normal', 'direct', 'very-direct']

export interface ToneSelectorProps {
  /** 현재 선택된 톤 값 (부모 state와 동기화) */
  value: string
  /** 톤이 바뀔 때 부모에게 알려서 저장·API 요청 등에 씁니다 */
  onChange: (tone: string) => void
}

/**
 * 리딩 말투 5단계 선택 UI입니다.
 * 선택된 칩만 테두리·배경이 강조되도록 해 사용자가 “지금 어떤 모드인지” 한눈에 알 수 있게 했습니다.
 *
 * [테마] 탭과 동일하게 — 선택: 포인트 컬러 테두리 + 연블루그레이 배경, 미선택: 흰 배경 + muted 텍스트.
 */
export default function ToneSelector({ value, onChange }: ToneSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {TONES.map((tone) => {
        const selected = value === tone
        return (
          <button
            key={tone}
            type="button"
            onClick={() => onChange(tone)}
            className={[
              'rounded-full border px-3 py-2 text-sm transition-all duration-300 sm:px-4',
              selected
                ? 'border-[#4a6fa5] bg-[#eef1f8] text-[#2c2c2e] shadow-[0_4px_20px_rgba(74,111,165,0.12)]'
                : 'border-[#e0e0e5] bg-white text-[#6e6e73] backdrop-blur-sm hover:border-[#4a6fa5]/40',
            ].join(' ')}
          >
            {TONE_LABELS[tone]}
          </button>
        )
      })}
    </div>
  )
}
