'use client'

import { useEffect, useState } from 'react'
import type { DrawnCard, Spread } from '@/types/tarot'

export interface CardSpreadProps {
  spread: Spread
  /**
   * step 3에서 /api/reading 호출 후 받은 실제 카드 배열입니다.
   * step 4는 이 배열을 "뒷면 상태"로만 시작하고, 클릭하면서 순차 공개합니다.
   */
  drawnCards: DrawnCard[]
  /** 앞에서부터 몇 장까지 공개됐는지 (0이면 전부 뒷면) */
  revealedCount: number
  /** 다음 순서 카드를 뒤집을 때 호출 (한 장씩만 열리게 page에서 제어) */
  onRevealNext: () => void
  /** 공통 비활성 제어용 (현재는 주로 안전장치로 유지) */
  drawLoading?: boolean
}

/** symbol 문자열(예: "9 ♦")을 위/아래로 나눠 카드 앞면에 배치합니다 */
function parseSymbol(symbol: string) {
  const parts = symbol.trim().split(/\s+/)
  if (parts.length >= 2) {
    return { rank: parts[0], glyph: parts.slice(1).join(' ') }
  }
  return { rank: '', glyph: symbol.trim() }
}

/**
 * 카드 뒷면: 흰 배경 + 회색 테두리, 중앙에 브랜드명만 포인트 컬러로 표시.
 * (이전 연핑크·꽃 이모지 디자인을 요청대로 단정한 모노 톤으로 교체했습니다.)
 */
function CardBack() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-[#e0e0e5] bg-[#ffffff] shadow-inner">
      <span className="font-serif text-[10px] font-medium tracking-[0.25em] text-[#4a6fa5]">OvO TAROT</span>
    </div>
  )
}

function TarotFace({
  card,
  isReversed,
}: {
  card: DrawnCard['card']
  isReversed: boolean
}) {
  const { rank, glyph } = parseSymbol(card.symbol)
  return (
    <div
      className={[
        'flex h-full w-full flex-col items-center justify-center rounded-2xl border border-[#e0e0e5] bg-[#ffffff] px-2 py-3 text-center shadow-[0_4px_20px_rgba(74,111,165,0.1)]',
        isReversed ? 'rotate-180' : '',
      ].join(' ')}
    >
      <span className="font-serif text-xs text-[#6e6e73]">{rank}</span>
      <span className="my-2 font-serif text-3xl text-[#4a6fa5]">{glyph || '✦'}</span>
      <span className="text-xs font-medium text-[#2c2c2e]">{card.name_ko}</span>
      {isReversed && <span className="mt-1 text-[10px] text-[#6e6e73]">(역방향)</span>}
    </div>
  )
}

interface SlotProps {
  /** 카드 아래에 보여줄 포지션 설명 텍스트 */
  meaning: string
  /** 카드 본체(앞/뒤) */
  children: React.ReactNode
  /** 실제 클릭 시 호출될 핸들러 */
  onClick?: () => void
  /** 순서 조건을 만족했는지 여부 (true일 때만 클릭 허용) */
  clickable?: boolean
  /** 이미 공개된 카드인지 여부 (공개된 카드는 다시 뒤집지 않으므로 비활성 처리) */
  revealed?: boolean
}

function PositionSlot({ meaning, children, onClick, clickable, revealed }: SlotProps) {
  const shellClass =
    'relative h-44 w-[7.25rem] sm:h-52 sm:w-[8.25rem] [perspective:1000px]'
  return (
    <div className="flex flex-col items-center gap-2">
      {/**
       * 포지션 텍스트 길이(1줄/2줄)와 관계없이 카드의 y축 위치가 흔들리지 않도록
       * 텍스트 영역 높이를 고정(h-[40px])하고, 텍스트는 상단 정렬(items-start)합니다.
       */}
      <p className="flex h-[40px] max-w-[10rem] items-start justify-center whitespace-normal break-keep break-words text-center text-[10px] leading-snug text-[#6e6e73] sm:max-w-[11rem] sm:text-xs">
        {meaning}
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable || revealed}
        aria-disabled={!clickable || revealed}
        className={[
          shellClass,
          'rounded-2xl text-left transition-opacity focus:outline-none',
          clickable && !revealed
            ? 'cursor-pointer hover:opacity-95 focus:ring-2 focus:ring-[#4a6fa5]/40'
            : 'cursor-default',
        ].join(' ')}
      >
        {children}
      </button>
    </div>
  )
}

function FlipWrapper({
  revealed,
  front,
}: {
  revealed: boolean
  front: React.ReactNode
}) {
  return (
    <div className="relative h-full w-full [transform-style:preserve-3d]">
      <div
        className="absolute inset-0 z-10 transition-transform duration-700"
        style={{
          transformStyle: 'preserve-3d',
          /**
           * rotateY(-180deg): 오른쪽으로 넘기는 느낌의 플립 방향을 명시합니다.
           * (브라우저 좌표계 기준에서 사용자가 체감하는 우측 플립)
           */
          transform: revealed ? 'rotateY(-180deg)' : 'rotateY(0deg)',
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            /**
             * 앞/뒤 레이어가 버튼 클릭을 가로채지 않도록 pointer-events를 막고,
             * 클릭 이벤트는 부모 button(PositionSlot)로 일원화합니다.
             */
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
          {front}
        </div>
      </div>
    </div>
  )
}

/**
 * 카드 수에 따라 레이아웃을 바꿉니다.
 * - 3장: 한 줄
 * - 5장: 2-2-1 (피라미드형 배치)
 * - 7장: 위 3 · 아래 4
 */
function SpreadGrid({
  count,
  children,
}: {
  count: number
  children: React.ReactNode[]
}) {
  if (count === 3) {
    return (
      <div className="flex flex-wrap justify-center gap-6 sm:gap-10">
        {children}
      </div>
    )
  }
  if (count === 5) {
    const [a, b, c, d, e] = children
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-wrap justify-center gap-6 sm:gap-12">
          {a}
          {b}
        </div>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-12">
          {c}
          {d}
        </div>
        <div className="flex justify-center">{e}</div>
      </div>
    )
  }
  if (count === 7) {
    const [a, b, c, d, e, f, g] = children
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          {a}
          {b}
          {c}
        </div>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
          {d}
          {e}
          {f}
          {g}
        </div>
      </div>
    )
  }
  return <div className="flex flex-wrap justify-center gap-6">{children}</div>
}

export default function CardSpread({
  spread,
  drawnCards,
  revealedCount,
  onRevealNext,
  drawLoading,
}: CardSpreadProps) {
  const positions = [...spread.positions].sort((a, b) => a.position - b.position)
  const n = positions.length
  /**
   * 카드 공개 상태를 "인덱스별"로 관리합니다.
   * 기존 revealedCount 기반(index < revealedCount) 방식은 순서 강제에 유리하지만,
   * 이번 요구사항(아무 카드나 먼저 뒤집기)에는 맞지 않아서 boolean 배열로 전환했습니다.
   */
  const [revealedByIndex, setRevealedByIndex] = useState<boolean[]>([])

  useEffect(() => {
    /**
     * 스프레드/카드가 바뀌면 공개 상태를 전부 false로 초기화합니다.
     * 중요: 순서 강제 표현(idx < revealedCount)을 완전히 제거해
     * "어떤 카드든 먼저 클릭 가능" 규칙을 코드 레벨에서 확실히 보장합니다.
     */
    setRevealedByIndex(drawnCards.map(() => false))
  }, [drawnCards])

  const slots = positions.map((pos, index) => {
    const drawn = drawnCards[index]
    const revealed = !!drawn && !!revealedByIndex[index]
    /**
     * 순서 제한 제거:
     * - index === revealedCount 조건을 제거해 어떤 카드든 즉시 클릭 가능
     * - 이미 공개된 카드(revealed)는 비활성 처리
     */
    const canClick = !!drawn && !revealed && !drawLoading

    const handleClick = () => {
      if (!canClick) return
      setRevealedByIndex((prev) => {
        const next = [...prev]
        next[index] = true
        return next
      })
      /** 부모의 공개 개수 카운트(revealedCount)도 같이 증가시켜 상단 미니 카드 표시와 동기화합니다. */
      onRevealNext()
    }

    return (
      <PositionSlot
        key={pos.position}
        meaning={pos.meaning}
        onClick={handleClick}
        clickable={canClick}
        revealed={revealed}
      >
        <FlipWrapper
          revealed={revealed}
          front={
            <div className="relative h-full w-full">
              <span className="absolute left-2 top-2 z-20 rounded-md bg-[#ffffff]/90 px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]">
                {pos.position}
              </span>
              <TarotFace card={drawn.card} isReversed={drawn.isReversed} />
            </div>
          }
        />
      </PositionSlot>
    )
  })

  return (
    <div className="rounded-2xl border border-[#e0e0e5] bg-white/60 p-6 shadow-[0_4px_20px_rgba(74,111,165,0.12)] backdrop-blur-sm sm:p-10">
      <h2 className="mb-2 text-center font-medium text-[#2c2c2e]">
        <span className="text-[#4a6fa5]">✦</span> {spread.name} <span className="text-[#4a6fa5]">✦</span>
      </h2>
      <p className="mb-10 text-center text-xs text-[#6e6e73]">카드를 하나씩 탭해서 뒤집어보세요</p>

      <SpreadGrid count={n}>{slots}</SpreadGrid>
      {revealedCount < drawnCards.length && (
        <p className="mt-8 text-center text-xs text-[#6e6e73]">
          {/** 안내 줄 장식: 🌸 → ◈ (톤 선택 기호와 통일) */}
          <span className="text-[#4a6fa5]">◈</span> 다음 카드를 탭해 주세요 ({revealedCount}/{drawnCards.length})
        </p>
      )}
    </div>
  )
}
