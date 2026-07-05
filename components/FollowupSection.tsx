'use client'

import { useState } from 'react'
import type { DrawnCard } from '@/types/tarot'

interface FollowupItem {
  question: string
  answer: string
  drawnCards?: DrawnCard[]
}

export interface FollowupSectionProps {
  /** 사용자가 던진 추가 질문과 AI 답변(및 후속 카드)을 차곡차곡 쌓아 보여줍니다 */
  followups: FollowupItem[]
  /** 새 추가 질문을 서버에 보내고 답을 기다리는 중인지 여부 */
  loading?: boolean
}

/** CardSpread와 동일한 파싱 규칙을 재사용해 카드 앞면 기호를 일관되게 보여줍니다. */
function parseSymbol(symbol: string) {
  const parts = symbol.trim().split(/\s+/)
  if (parts.length >= 2) return { rank: parts[0], glyph: parts.slice(1).join(' ') }
  return { rank: '', glyph: symbol.trim() }
}

/**
 * 카드 뒷면 스타일은 메인 스프레드(CardSpread)의 클래스/색 체계를 그대로 따릅니다.
 * 사용자 입장에서 "메인 리딩 카드"와 "추가 질문 카드"가 같은 시스템이라는 인식을 주기 위함입니다.
 */
function CardBack() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-[#e0e0e5] bg-[#ffffff] shadow-inner">
      <span className="font-serif text-[10px] font-medium tracking-[0.25em] text-[#4a6fa5]">OvO TAROT</span>
    </div>
  )
}

/** 앞면도 CardSpread 톤과 동일하게 유지해 시각적 일관성을 보장합니다. */
function TarotFace({ drawn }: { drawn: DrawnCard }) {
  const { rank, glyph } = parseSymbol(drawn.card.symbol)
  return (
    <div
      className={[
        'flex h-full w-full flex-col items-center justify-center rounded-2xl border border-[#e0e0e5] bg-[#ffffff] px-2 py-3 text-center shadow-[0_4px_20px_rgba(74,111,165,0.1)]',
        drawn.isReversed ? 'rotate-180' : '',
      ].join(' ')}
    >
      <span className="font-serif text-xs text-[#6e6e73]">{rank}</span>
      <span className="my-2 font-serif text-3xl text-[#4a6fa5]">{glyph || '✦'}</span>
      <span className="text-xs font-medium text-[#2c2c2e]">{drawn.card.name_ko}</span>
      {drawn.isReversed && <span className="mt-1 text-[10px] text-[#6e6e73]">(역방향)</span>}
    </div>
  )
}

/**
 * 단일 후속 답변 블록:
 * - 카드가 오면 뒷면 상태에서 시작
 * - 사용자가 순서대로 클릭하며 한 장씩 공개
 * - 카드를 모두 연 뒤 답변 텍스트 노출
 */
function FollowupCardItem({ item }: { item: FollowupItem }) {
  const cards = item.drawnCards ?? []
  const [revealedCount, setRevealedCount] = useState(0)
  const shouldShowAnswer = cards.length === 0 || revealedCount >= cards.length

  return (
    <div className="rounded-2xl border border-[#e0e0e5] bg-[#ffffff] p-5 shadow-[0_4px_20px_rgba(74,111,165,0.08)]">
      <p className="mb-3 text-xs font-medium text-[#4a6fa5]">Q. {item.question}</p>

      {cards.length > 0 && (
        <div className="mb-4">
          {/**
           * 1~3장 카드 영역:
           * - 버튼 단위로 클릭을 받게 해 키보드 접근성(탭/엔터)도 함께 확보합니다.
           * - "다음 순서 카드만 클릭 가능" 규칙으로 무작위 공개를 막아 스토리 흐름을 유지합니다.
           */}
          <div className="flex flex-wrap justify-center gap-3">
            {cards.map((drawn, index) => {
              const revealed = index < revealedCount
              const canClick = index === revealedCount && revealedCount < cards.length
              return (
                <button
                  key={`${drawn.card.id}-${index}`}
                  type="button"
                  onClick={() => {
                    if (canClick) setRevealedCount((c) => c + 1)
                  }}
                  disabled={!canClick}
                  className={[
                    'relative h-40 w-[6.75rem] rounded-2xl text-left transition-opacity focus:outline-none [perspective:1000px]',
                    canClick
                      ? 'cursor-pointer hover:opacity-95 focus:ring-2 focus:ring-[#4a6fa5]/40'
                      : 'cursor-default',
                  ].join(' ')}
                >
                  <div className="relative h-full w-full [transform-style:preserve-3d]">
                    <div
                      className="absolute inset-0 z-10 transition-transform duration-700"
                      style={{
                        transformStyle: 'preserve-3d',
                        transform: revealed ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                      }}
                    >
                      <div
                        className="absolute inset-0 overflow-hidden rounded-2xl"
                        style={{
                          backfaceVisibility: 'hidden',
                          WebkitBackfaceVisibility: 'hidden',
                          pointerEvents: 'none',
                        }}
                      >
                        <CardBack />
                      </div>
                      <div
                        className="absolute inset-0 overflow-hidden rounded-2xl"
                        style={{
                          backfaceVisibility: 'hidden',
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                          pointerEvents: 'none',
                        }}
                      >
                        <TarotFace drawn={drawn} />
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {!shouldShowAnswer && (
            <p className="mt-3 text-center text-xs text-[#6e6e73]">
              카드를 순서대로 열어 주세요 ({revealedCount}/{cards.length})
            </p>
          )}
        </div>
      )}

      {shouldShowAnswer && (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#2c2c2e]">{item.answer}</div>
      )}
    </div>
  )
}

/**
 * 추가 질문 히스토리:
 * - 로딩 중엔 사용자가 "요청이 들어갔는지" 즉시 알 수 있도록 안내 블록을 노출합니다.
 * - 답변 도착 후에는 각 질문별 카드 공개 인터랙션을 독립적으로 유지합니다.
 */
export default function FollowupSection({ followups, loading }: FollowupSectionProps) {
  if (followups.length === 0 && !loading) return null

  return (
    <div className="mt-8 space-y-4">
      <h3 className="text-center text-sm font-medium text-[#2c2c2e]">
        <span className="text-[#4a6fa5]">✦</span> 추가 답변
      </h3>

      {followups.map((f, i) => (
        <FollowupCardItem key={i} item={f} />
      ))}

      {loading && (
        <div className="rounded-2xl border border-[#e0e0e5] bg-[#ffffff] p-5 shadow-[0_4px_20px_rgba(74,111,165,0.08)]">
          <p className="mb-3 text-xs font-medium text-[#4a6fa5]">답변을 준비 중이에요…</p>
          {/**
           * 로딩 단계에서도 카드 시스템과의 연결감을 주기 위해
           * 실제 카드와 동일한 뒷면 3장을 펄스 애니메이션으로 배치했습니다.
           */}
          <div className="flex flex-wrap justify-center gap-3">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-40 w-[6.75rem] animate-pulse">
                <CardBack />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
