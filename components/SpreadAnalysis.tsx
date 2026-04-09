'use client'

import type { AnalysisResult } from '@/types/tarot'
import { CATEGORY_LABELS, type Category } from '@/types/tarot'

export interface SpreadAnalysisProps {
  analysis: AnalysisResult
  /** “카드 뽑기” 클릭 시 다음 단계(카드 뒷면 화면)로 넘깁니다 */
  onDraw: () => void
}

/**
 * 3단계: AI 분석 요약, 나눠 볼 질문, 스프레드 소개, 포지션 미리보기.
 * 질문은 번호 목록으로 읽기 쉽게 정리했습니다.
 */
export default function SpreadAnalysis({ analysis, onDraw }: SpreadAnalysisProps) {
  const cats = analysis.detectedCategories
    .filter((c): c is Category => c in CATEGORY_LABELS)
    .map((c) => CATEGORY_LABELS[c])

  return (
    <div className="space-y-8 rounded-2xl border border-[#f0d0d5] bg-white/60 p-6 shadow-[0_4px_20px_rgba(200,116,138,0.15)] backdrop-blur-sm sm:p-8">
      <section>
        <h2 className="mb-3 text-center text-lg font-medium tracking-wide text-[#6b4c52]">
          <span className="text-[#c8748a]">✦</span> 상황 분석 <span className="text-[#c8748a]">✦</span>
        </h2>
        <p className="leading-relaxed text-[#6b4c52]">{analysis.situationSummary}</p>
        {cats.length > 0 && (
          <p className="mt-3 text-xs text-[#a07880]">감지된 주제: {cats.join(', ')}</p>
        )}
      </section>

      <section className="rounded-2xl bg-[#fffafa] p-5 ring-1 ring-[#f0d0d5]">
        <p className="mb-3 text-sm font-medium text-[#c8748a]">이렇게 나눠서 볼게요:</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#6b4c52]">
          {analysis.questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-center text-base font-medium text-[#6b4c52]">
          <span className="text-[#d4956a]">✦</span> {analysis.spread.name}{' '}
          <span className="text-[#d4956a]">✦</span>
        </h3>
        <p className="mb-6 text-center text-xs text-[#a07880]">
          {analysis.spread.cardCount}장의 카드로 살펴봅니다.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {analysis.spread.positions.map((p) => (
            <div
              key={p.position}
              className="rounded-xl border border-[#f0d0d5] bg-[#fffafa] px-4 py-3 text-sm text-[#6b4c52]"
            >
              <span className="font-medium text-[#c8748a]">{p.position}.</span> {p.meaning}
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-center pt-2">
        <button
          type="button"
          onClick={onDraw}
          className="rounded-full bg-gradient-to-r from-[#c8748a] to-[#d4956a] px-10 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(200,116,138,0.25)] transition-transform duration-300 hover:scale-[1.02]"
        >
          카드 뽑기 <span className="text-white/90">✦</span>
        </button>
      </div>
    </div>
  )
}
