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
 * 2·5단계 공통 로딩 UI (◎ + 펄스).
 * 같은 모양을 재사용해 “지금 AI가 일하는 중”이라는 인식을 통일했습니다.
 * 이모지 수정구슬(🔮)은 요청에 따라 기하 기호 ◎ 로 바꿨습니다.
 */
export default function StepLoading({ title, subtitle, label }: StepLoadingProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="mb-6 animate-pulse text-5xl text-[#4a6fa5] drop-shadow-sm" aria-hidden>
        ◎
      </div>
      <p className="mb-2 text-lg font-medium text-[#2c2c2e]">{title}</p>
      <p className="max-w-sm text-sm text-[#6e6e73]">{subtitle}</p>
    </div>
  )
}
