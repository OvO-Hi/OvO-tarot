'use client'

export interface FollowupSectionProps {
  /** 사용자가 던진 추가 질문과 AI 답변을 차곡차곡 쌓아 보여줍니다 */
  followups: { question: string; answer: string }[]
}

/**
 * 추가 질문 히스토리.
 * 각 항목을 작은 “카드” 블록으로 구분해 대화가 길어져도 읽기 쉽게 했습니다.
 */
export default function FollowupSection({ followups }: FollowupSectionProps) {
  if (followups.length === 0) return null

  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-center text-sm font-medium text-[#6b4c52]">
        <span className="text-[#c8748a]">✦</span> 추가 답변
      </h3>
      {followups.map((f, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[#f0d0d5] bg-[#fffafa] p-5 shadow-[0_4px_20px_rgba(200,116,138,0.08)]"
        >
          <p className="mb-2 text-xs font-medium text-[#c8748a]">Q. {f.question}</p>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#6b4c52]">{f.answer}</div>
        </div>
      ))}
    </div>
  )
}
