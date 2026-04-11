'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
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

interface ParsedSuggestionResult {
  readingBody: string
  suggestedQuestions: string[]
}

/**
 * 모델 출력의 "*✦ 추가 질문 제안*" 블록을 본문에서 분리해 구조화합니다.
 *
 * 왜 분리하나요?
 * - 원문이 한 줄 문자열로 들어오면 Markdown에서 덩어리로 렌더링되어 가독성이 떨어집니다.
 * - 여기서 1./2./3. 패턴을 먼저 추출하면 UI에서 항목별 간격·버튼을 제어할 수 있습니다.
 */
function parseSuggestedQuestions(readingText: string): ParsedSuggestionResult {
  const normalized = readingText.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const markerIndex = lines.findIndex((line) => line.includes('추가 질문 제안'))

  const extractFromBlock = (block: string) => {
    const byLine = block
      .split('\n')
      .map((line) => line.trim().replace(/^\*+|\*+$/g, ''))
      .map((line) => {
        const m = line.match(/^\d+\.\s*(.+)$/)
        return m ? m[1].trim() : ''
      })
      .filter(Boolean)

    if (byLine.length > 0) return byLine

    // 한 줄에 "1. ... 2. ... 3. ..." 형태로 붙어 있는 경우를 위한 보정 파서
    const compact = block.replace(/\n/g, ' ').replace(/^\*+|\*+$/g, '').trim()
    const result: string[] = []
    const regex = /\d+\.\s*(.+?)(?=\s+\d+\.|$)/g
    let match: RegExpExecArray | null = null
    while (true) {
      match = regex.exec(compact)
      if (!match) break
      const q = match[1].trim()
      if (q) result.push(q)
    }
    return result
  }

  if (markerIndex >= 0) {
    const head = lines.slice(0, markerIndex).join('\n').trimEnd()
    const suggestionBlock = lines.slice(markerIndex).join('\n').trim()
    const suggestedQuestions = extractFromBlock(suggestionBlock)
    if (suggestedQuestions.length > 0) {
      return { readingBody: head, suggestedQuestions }
    }
  }

  // 줄 단위 마커를 못 찾은 경우: 본문 끝에 붙은 inline 제안 패턴을 보정
  const inlineMatch = normalized.match(/(?:\*+\s*)?✦\s*추가 질문 제안[:：]?\s*([\s\S]*?)\s*(?:\*+)?$/)
  if (inlineMatch?.[1]) {
    const suggestedQuestions = extractFromBlock(inlineMatch[1])
    if (suggestedQuestions.length > 0) {
      const cutIndex = inlineMatch.index ?? normalized.length
      return { readingBody: normalized.slice(0, cutIndex).trimEnd(), suggestedQuestions }
    }
  }

  return { readingBody: normalized, suggestedQuestions: [] }
}

function MiniCard({ drawn }: { drawn: DrawnCard }) {
  const { rank, glyph } = parseSymbol(drawn.card.symbol)
  return (
    <div
      className={[
        'flex w-[4.5rem] shrink-0 flex-col items-center rounded-xl border border-[#e0e0e5] bg-[#ffffff] px-1 py-2 text-center sm:w-[5rem]',
        drawn.isReversed ? 'rotate-180' : '',
      ].join(' ')}
    >
      <span className="font-serif text-[9px] text-[#6e6e73]">{rank}</span>
      <span className="my-0.5 font-serif text-lg text-[#4a6fa5]">{glyph || '✦'}</span>
      <span className="text-[9px] font-medium leading-tight text-[#2c2c2e]">{drawn.card.name_ko}</span>
      <span className="mt-0.5 text-[8px] text-[#6e6e73]">{drawn.isReversed ? '역' : '정'}</span>
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
  /** page.tsx가 소유하는 추가 질문 입력값(컨트롤드 input) */
  followupInput: string
  /** 입력창 변경을 page state에 반영하기 위한 setter 콜백 */
  onFollowupInputChange: (value: string) => void
  /** 제안 질문 버튼 클릭 시 page의 followupInput state를 채우기 위한 콜백 */
  onSuggestQuestion: (value: string) => void
  /**
   * followup 항목에 drawnCards를 함께 담아 전달합니다.
   * FollowupSection에서 카드 뒤집기 UI를 구성하려면 질문/답변 텍스트 외에 카드 데이터가 필요합니다.
   */
  followups: { question: string; answer: string; drawnCards?: DrawnCard[] }[]
  followupLoading?: boolean
}

/**
 * 최종 리딩 화면: 캡처 영역(id=reading-capture), 마크다운 해석, 인쇄용 새 탭 열기, 추가 질문.
 * 저장은 html2canvas 대신 독립 HTML을 Blob으로 열어 브라우저 인쇄/PDF/다른 이름으로 저장을 쓰게 합니다.
 *
 * [리브랜딩·테마] 상단/하단 타이틀을 OvO TAROT로 통일했고,
 * 마크다운 blockquote(핵심 조언) 배경은 연블루그레이(#eef1f8)로 지정했습니다.
 */
export default function ReadingResult({
  situation,
  spread,
  drawnCards,
  revealedCount,
  reading,
  onFollowup,
  followupInput,
  onFollowupInputChange,
  onSuggestQuestion,
  followups,
  followupLoading,
}: ReadingResultProps) {
  const [saving, setSaving] = useState(false)
  const followInputRef = useRef<HTMLTextAreaElement>(null)

  /**
   * reading 문자열이 바뀔 때만 재파싱하도록 memo 처리해 불필요한 렌더 비용을 줄입니다.
   */
  const { readingBody, suggestedQuestions } = useMemo(() => parseSuggestedQuestions(reading), [reading])

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
    const t = followupInput.trim()
    if (!t || followupLoading) return
    onFollowup(t)
    /** 전송 직후 입력창을 비워 다음 질문을 바로 입력할 수 있게 합니다. */
    onFollowupInputChange('')
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
        className="rounded-2xl border border-[#e0e0e5] bg-white/80 p-6 shadow-[0_4px_20px_rgba(74,111,165,0.12)] backdrop-blur-sm sm:p-8"
      >
        <header className="mb-8 text-center">
          <p className="font-serif text-lg font-light tracking-[0.3em] text-[#2c2c2e] sm:text-xl">
            ✦ OvO TAROT ✦
          </p>
          <p className="mt-2 text-xs text-[#6e6e73]">✦ Sonnet이 리딩했습니다 ✦</p>
        </header>

        <section className="mb-8 rounded-2xl border border-[#e0e0e5] bg-[#ffffff] p-5">
          <h2 className="mb-2 text-sm font-medium text-[#4a6fa5]">✦ 질문</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#2c2c2e]">{situation}</p>
        </section>

        <section className="mb-8">
          <h2 className="mb-4 text-center text-sm font-medium text-[#2c2c2e]">
            ✦ {spread.name} ✦
          </h2>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {visibleCards.map((d, i) => (
              <MiniCard key={`${d.card.id}-${i}`} drawn={d} />
            ))}
          </div>
        </section>

        <article className="reading-md max-w-none text-[#2c2c2e]">
          <ReactMarkdown
            components={{
              /** ## 섹션 헤더: 아래 본문과 붙지 않도록 mb-12px (mb-3). 본문 첫 p는 globals.css의 h2+p 규칙으로 mt-8px */
              h2: ({ children }) => (
                <h2 className="mt-8 mb-4 border-b border-[#e0e0e5] pb-2 text-base font-semibold text-[#4a6fa5] first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-6 text-sm font-semibold text-[#2c2c2e]">{children}</h3>
              ),
              p: ({ children }) => <p className="!mt-0 mb-4 leading-relaxed last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-[#2c2c2e]">{children}</strong>,
              em: ({ children }) => (
                <em className="not-italic text-[#6e6e73] underline decoration-[#e0e0e5] decoration-2 underline-offset-4">
                  {children}
                </em>
              ),
              ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-5">{children}</ol>,
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              hr: () => <hr className="my-8 border-[#e0e0e5]" />,
              blockquote: ({ children }) => (
                <blockquote className="my-6 rounded-xl border border-[#e0e0e5] bg-[#eef1f8] px-5 py-4 text-sm text-[#2c2c2e] shadow-inner">
                  {children}
                </blockquote>
              ),
            }}
          >
            {readingBody}
          </ReactMarkdown>
        </article>

        {suggestedQuestions.length > 0 && (
          <section className="mt-8 rounded-2xl border border-[#e0e0e5] bg-[#ffffff] p-5">
            {/**
             * 제목 줄은 항상 고정 표기해 "추가 질문 제안" 영역이라는 맥락을 분명하게 보여줍니다.
             */}
            <h3 className="mb-4 text-sm font-semibold text-[#2c2c2e]">✦ 추가 질문 제안</h3>
            <div>
              {suggestedQuestions.map((q, i) => (
                <div
                  key={`${q}-${i}`}
                  className={[
                    'flex items-start justify-between gap-3 rounded-xl border border-[#e0e0e5] bg-white px-3 py-2',
                    i === 0 ? '' : 'mt-2',
                  ].join(' ')}
                >
                  <p className="text-sm leading-relaxed text-[#2c2c2e]">
                    <span className="mr-1 font-semibold text-[#4a6fa5]">{i + 1}.</span>
                    {q}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      /**
                       * 항목 옆 "→ 질문하기" 버튼:
                       * - 부모(page)의 followupInput state를 업데이트하고
                       * - textarea 위치로 스크롤 이동 + 포커스로 즉시 전송 가능한 상태를 만듭니다.
                       */
                      onSuggestQuestion(q)
                      requestAnimationFrame(() => {
                        followInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        followInputRef.current?.focus()
                      })
                    }}
                    className="shrink-0 rounded-full bg-[#4a6fa5] px-3 py-1 text-xs text-white transition-colors hover:bg-[#3a5f95]"
                  >
                    질문하기
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/**
         * 추가 질문 섹션은 로딩 상태도 함께 전달합니다.
         * 이렇게 하면 "전송 후 기다리는 중" 피드백을 질문 입력 폼 아래의 히스토리 맥락에서 바로 보여줄 수 있습니다.
         */}
        <FollowupSection followups={followups} loading={followupLoading} />

        <p className="mt-10 text-center text-[10px] text-[#6e6e73]">✦ OvO TAROT ✦</p>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-full border border-[#e0e0e5] bg-white/80 px-8 py-3 text-sm text-[#2c2c2e] shadow-sm transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {/** 저장 버튼: 💾 → ▽ (디자인 시스템에 맞춘 기호 교체) */}
          {saving ? '열리는 중…' : '리딩 저장하기 ▽'}
        </button>
      </div>

      <form
        onSubmit={submitFollow}
        className="rounded-2xl border border-[#e0e0e5] bg-white/60 p-6 backdrop-blur-sm"
      >
        <h3 className="mb-1 text-center text-sm font-medium text-[#2c2c2e]">
          <span className="text-[#4a6fa5]">✦</span> 추가 질문이 있으신가요?
        </h3>
        <p className="mb-4 text-center text-xs text-[#6e6e73]">이어서 궁금한 점을 남겨 주세요.</p>
        <textarea
          ref={followInputRef}
          value={followupInput}
          onChange={(e) => onFollowupInputChange(e.target.value)}
          rows={3}
          placeholder="예: 그러면 타이밍은 언제가 좋을까요?"
          className="mb-4 w-full resize-y rounded-xl border border-[#e0e0e5] bg-[#ffffff] px-4 py-3 text-sm focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={followupLoading || !followupInput.trim()}
            className="rounded-full bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] px-6 py-2.5 text-sm text-white disabled:opacity-50"
          >
            {followupLoading ? '답변 생성 중…' : '보내기 ✦'}
          </button>
        </div>
      </form>
    </div>
  )
}
