'use client'

export interface StepLoadingProps {
  /** 메인 상태 문구 — 2단계와 5단계에서 서로 다른 문장을 씁니다 */
  title: string
  /** 큰 제목 아래에 붙는 안내 문구 (단계마다 다르게 넘깁니다) */
  subtitle: string
  /** 접근성용: 스크린 리더가 읽을 짧은 설명 */
  label?: string
}

/**
 * 2·5단계 공통 로딩 UI (수정구슬 + 펄스).
 * 같은 모양을 재사용해 “지금 AI가 일하는 중”이라는 인식을 통일했습니다.
 */
export default function StepLoading({ title, subtitle, label }: StepLoadingProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="mb-6 animate-pulse text-5xl drop-shadow-sm" aria-hidden>
        🔮
      </div>
      <p className="mb-2 text-lg font-medium text-[#6b4c52]">{title}</p>
      <p className="max-w-sm text-sm text-[#a07880]">{subtitle}</p>
    </div>
  )
}
