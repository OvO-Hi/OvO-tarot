'use client'

import type { ReactNode } from 'react'

export type MainTab = 'reading' | 'guestbook'

interface SiteChromeProps {
  activeTab: MainTab
  onTabChange: (t: MainTab) => void
  /** 로고 영역 클릭 시 처음 화면으로 — app/page에서 state 초기화와 연결 */
  onHome: () => void
  children: ReactNode
  /** 푸터 크레딧 위·아래에 추가 UI(예: 관리자 전용 버튼)를 넣을 때 사용합니다 */
  footerAddon?: ReactNode
}

/**
 * 스크린샷에 나온 상단 꽃·타이틀·탭·하단 크레딧을 한곳에 모았습니다.
 * 본문(children)만 단계별로 바뀌고, 헤더/탭/푸터는 그대로 유지됩니다.
 *
 * [테마 변경 요약]
 * - 배경: 연회색(#f5f5f7) → 흰색에 가까운 그라데이션으로 소프트 모노 느낌.
 * - 브랜드명: LARI TAROT → OvO TAROT.
 * - 헤더 장식: 이모지 꽃(🌸) 대신 ✦ 기호로 통일(요청사항).
 * - 탭: 활성은 슬레이트 블루 그라데이션, 비활성은 흰 배경 + 회색 글자.
 */
export default function SiteChrome({
  activeTab,
  onTabChange,
  onHome,
  children,
  footerAddon,
}: SiteChromeProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#f5f5f7] to-[#ffffff]">
      <header className="px-4 pb-2 pt-10 text-center sm:pt-14">
        {/**
         * button 안에는 h1 같은 플로우 블록을 넣을 수 없어(HTML 규칙),
         * span + role="heading"으로 같은 뜻을 접근성에 맞게 전달합니다.
         */}
        <button
          type="button"
          onClick={onHome}
          className="mx-auto block cursor-pointer rounded-xl border-0 bg-transparent p-2 text-center transition-opacity duration-200 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/40 focus:ring-offset-2 focus:ring-offset-[#f5f5f7]"
          aria-label="홈 — 처음 화면으로 이동"
        >
          {/** 헤더 상단 장식: 핑크 테마의 🌸 대신 ✦ — 브랜드 톤과 맞춤 */}
          <span className="mb-3 block text-2xl text-[#4a6fa5]" aria-hidden>
            ✦
          </span>
          <span
            className="block font-serif text-xl font-light tracking-[0.3em] text-[#2c2c2e] sm:text-2xl"
            role="heading"
            aria-level={1}
          >
            ✦ OvO TAROT ✦
          </span>
          <span className="mt-2 block text-sm text-[#6e6e73]">당신만을 위한 맞춤 타로 리딩</span>
        </button>

        {/**
         * 탭 컨테이너: 연한 테두리로 구분.
         * 비활성 탭은 “흰 배경 + #6e6e73 글자”로 요구사항 반영(호버 시 본문색으로 살짝 진하게).
         */}
        <div className="mx-auto mt-8 flex max-w-md rounded-full border border-[#e0e0e5] bg-white/60 p-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => onTabChange('reading')}
            className={[
              'flex-1 rounded-full py-3 text-sm font-medium transition-all duration-300',
              activeTab === 'reading'
                ? 'bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] text-white shadow-md'
                : 'bg-white text-[#6e6e73] hover:text-[#2c2c2e]',
            ].join(' ')}
          >
            {/** 로딩 아이콘과 동일하게 🔮 → ◎ 로 통일 */}
            ◎ 타로 리딩
          </button>
          <button
            type="button"
            onClick={() => onTabChange('guestbook')}
            className={[
              'flex-1 rounded-full py-3 text-sm font-medium transition-all duration-300',
              activeTab === 'guestbook'
                ? 'bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] text-white shadow-md'
                : 'bg-white text-[#6e6e73] hover:text-[#2c2c2e]',
            ].join(' ')}
          >
            🪄 방명록
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="mt-auto px-4 py-8 text-center">
        {footerAddon != null && <div className="mb-4">{footerAddon}</div>}
        <div className="mx-auto max-w-lg rounded-full bg-white/50 px-4 py-3 text-[10px] text-[#6e6e73] backdrop-blur-sm">
          {/** 푸터 크레딧: OvO-Hi GitHub 프로필로 연결 (새 탭, 보안용 rel 유지) */}
          <a
            href="https://github.com/OvO-Hi"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block cursor-pointer text-inherit no-underline transition-opacity hover:opacity-70"
          >
            ✦ by OvO-Hi ✦
          </a>
        </div>
      </footer>
    </div>
  )
}
