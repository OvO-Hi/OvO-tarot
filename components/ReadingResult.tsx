'use client'

import { useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { DrawnCard, Spread } from '@/types/tarot'
import FollowupSection from './FollowupSection'
import { buildStandaloneReadingHtml, stripClassesAndInlineStyles } from './reading-standalone-html'

function parseSymbol(symbol: string) {
  const parts = symbol.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { rank: parts[0], glyph: parts.slice(1).join(' ') }
  }
  return { rank: '', glyph: symbol.trim() }
}

function MiniCard({ drawn }: { drawn: DrawnCard }) {
  const { rank, glyph } = parseSymbol(drawn.card.symbol)
  return (
    <div
      className={[
        'flex w-[4.5rem] shrink-0 flex-col items-center rounded-xl border border-[#f0d0d5] bg-[#fffafa] px-1 py-2 text-center sm:w-[5rem]',
        drawn.isReversed ? 'rotate-180' : '',
      ].join(' ')}
    >
      <span className="font-serif text-[9px] text-[#a07880]">{rank}</span>
      <span className="my-0.5 font-serif text-lg text-[#c8748a]">{glyph || '✦'}</span>
      <span className="text-[9px] font-medium leading-tight text-[#6b4c52]">{drawn.card.name_ko}</span>
      <span className="mt-0.5 text-[8px] text-[#a07880]">{drawn.isReversed ? '역' : '정'}</span>
    </div>
  )
}

export interface ReadingResultProps {
  situation: string
  spread: Spread
  drawnCards: DrawnCard[]
  /**
   * step 4에서 일부만 공개한 상태로 step 6에 올 수 있으므로,
   * 상단 미니어처는 공개된 카드 개수만큼만 보여줍니다.
   */
  revealedCount: number
  reading: string
  onFollowup: (q: string) => void
  followups: { question: string; answer: string }[]
  followupLoading?: boolean
}

/**
 * 최종 리딩 화면: 캡처 영역(id=reading-capture), 마크다운 해석, 인쇄용 새 탭 열기, 추가 질문.
 * 저장은 html2canvas 대신 독립 HTML을 Blob으로 열어 브라우저 인쇄/PDF/다른 이름으로 저장을 쓰게 합니다.
 */
export default function ReadingResult({
  situation,
  spread,
  drawnCards,
  revealedCount,
  reading,
  onFollowup,
  followups,
  followupLoading,
}: ReadingResultProps) {
  const [followQ, setFollowQ] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(() => {
    /**
     * 1) #reading-capture 안의 DOM만 복제합니다 (버튼/추가질문 폼은 밖에 있음).
     * 2) class/style을 제거해 Tailwind 의존을 끊고, 독립 HTML의 순수 CSS만 적용되게 합니다.
     * 3) Blob URL로 새 탭을 열어 인쇄(Ctrl+P)나 "다른 이름으로 저장"을 안내합니다.
     */
    const el = document.getElementById('reading-capture')
    if (!el) return
    setSaving(true)
    try {
      const clone = el.cloneNode(true) as HTMLElement
      stripClassesAndInlineStyles(clone)
      clone.removeAttribute('id')
      const innerHtml = clone.innerHTML
      const html = buildStandaloneReadingHtml(innerHtml)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (!win) {
        URL.revokeObjectURL(url)
        alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.')
        return
      }
      /** blob URL은 새 탭이 로드된 뒤에도 잠시 유지해 두었다가 회수합니다 */
      setTimeout(() => URL.revokeObjectURL(url), 120000)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }, [])

  const submitFollow = (e: React.FormEvent) => {
    e.preventDefault()
    const t = followQ.trim()
    if (!t || followupLoading) return
    onFollowup(t)
    setFollowQ('')
  }

  /**
   * 공개된 카드가 0장인 상태에서도 step 6에 진입할 수 있으므로,
   * 최소 1장은 보여줘서 "카드 정보 영역이 비었다"는 인상을 줄입니다.
   */
  const visibleCards = drawnCards.slice(0, Math.max(1, Math.min(revealedCount, drawnCards.length)))

  return (
    <div className="space-y-8">
      <div
        id="reading-capture"
        className="rounded-2xl border border-[#f0d0d5] bg-white/80 p-6 shadow-[0_4px_20px_rgba(200,116,138,0.15)] backdrop-blur-sm sm:p-8"
      >
        <header className="mb-8 text-center">
          <p className="font-serif text-lg font-light tracking-[0.3em] text-[#6b4c52] sm:text-xl">
            ✦ LARI TAROT ✦
          </p>
          <p className="mt-2 text-xs text-[#a07880]">✦ Sonnet이 리딩했습니다 ✦</p>
        </header>

        <section className="mb-8 rounded-2xl border border-[#e8d4d8] bg-[#fffafa] p-5">
          <h2 className="mb-2 text-sm font-medium text-[#c8748a]">✦ 질문</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#6b4c52]">{situation}</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-center text-sm font-medium text-[#6b4c52]">
            ✦ {spread.name} ✦
          </h2>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {visibleCards.map((d, i) => (
              <MiniCard key={`${d.card.id}-${i}`} drawn={d} />
            ))}
          </div>
        </section>

        <article className="reading-md max-w-none text-[#6b4c52]">
          <ReactMarkdown
            components={{
              /** ## 섹션 헤더: 아래 본문과 붙지 않도록 mb-12px (mb-3). 본문 첫 p는 globals.css의 h2+p 규칙으로 mt-8px */
              h2: ({ children }) => (
                <h2 className="mt-8 border-b border-[#f0d0d5] pb-2 text-base font-semibold text-[#c8748a] first:mt-0 mb-3">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-6 text-sm font-semibold text-[#6b4c52]">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-4 leading-relaxed last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-[#6b4c52]">{children}</strong>,
              em: ({ children }) => (
                <em className="not-italic text-[#a07880] underline decoration-[#f0d0d5] decoration-2 underline-offset-4">
                  {children}
                </em>
              ),
              ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-5">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="my-8 border-[#f0d0d5]" />,
              blockquote: ({ children }) => (
                <blockquote className="my-6 rounded-xl border border-[#f0d0d5] bg-gradient-to-br from-[#fce8e8] to-[#fffafa] px-5 py-4 text-sm text-[#6b4c52] shadow-inner">
                  {children}
                </blockquote>
              ),
            }}
          >
            {reading}
          </ReactMarkdown>
        </article>

        <FollowupSection followups={followups} />

        <p className="mt-10 text-center text-[10px] text-[#a07880]">✦ LARI TAROT ✦</p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-full border border-[#f0d0d5] bg-white/80 px-8 py-3 text-sm text-[#6b4c52] shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {saving ? '열리는 중…' : '리딩 저장하기 💾'}
        </button>
      </div>

      <form
        onSubmit={submitFollow}
        className="rounded-2xl border border-[#f0d0d5] bg-white/60 p-6 backdrop-blur-sm"
      >
        <h3 className="mb-1 text-center text-sm font-medium text-[#6b4c52]">
          <span className="text-[#c8748a]">✦</span> 추가 질문이 있으신가요?
        </h3>
        <p className="mb-4 text-center text-xs text-[#a07880]">이어서 궁금한 점을 남겨 주세요.</p>
        <textarea
          value={followQ}
          onChange={(e) => setFollowQ(e.target.value)}
          rows={3}
          placeholder="예: 그러면 타이밍은 언제가 좋을까요?"
          className="mb-4 w-full resize-y rounded-xl border border-[#f0d0d5] bg-[#fffafa] px-4 py-3 text-sm focus:border-[#c8748a] focus:outline-none focus:ring-2 focus:ring-[#c8748a]/20"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={followupLoading || !followQ.trim()}
            className="rounded-full bg-gradient-to-r from-[#c8748a] to-[#d4956a] px-6 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {followupLoading ? '답변 생성 중…' : '보내기 ✦'}
          </button>
        </div>
      </form>
    </div>
  )
}
