'use client'

export type MainTab = 'reading' | 'guestbook'

interface SiteChromeProps {
  activeTab: MainTab
  onTabChange: (t: MainTab) => void
  /** 로고 영역 클릭 시 처음 화면으로 — app/page에서 state 초기화와 연결 */
  onHome: () => void
  children: React.ReactNode
}

/**
 * 스크린샷에 나온 상단 꽃·타이틀·탭·하단 크레딧을 한곳에 모았습니다.
 * 본문(children)만 단계별로 바뀌고, 헤더/탭/푸터는 그대로 유지됩니다.
 */
export default function SiteChrome({ activeTab, onTabChange, onHome, children }: SiteChromeProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#fdf0f0] to-[#fffafa]">
      <header className="px-4 pb-2 pt-10 text-center sm:pt-14">
        {/**
         * button 안에는 h1 같은 플로우 블록을 넣을 수 없어(HTML 규칙),
         * span + role="heading"으로 같은 뜻을 접근성에 맞게 전달합니다.
         */}
        <button
          type="button"
          onClick={onHome}
          className="mx-auto block cursor-pointer rounded-xl border-0 bg-transparent p-2 text-center transition-opacity duration-200 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#c8748a]/40 focus:ring-offset-2 focus:ring-offset-[#fdf0f0]"
          aria-label="홈 — 처음 화면으로 이동"
        >
          <span className="mb-3 block text-2xl text-[#c8748a]" aria-hidden>
            🌸
          </span>
          <span
            className="block font-serif text-xl font-light tracking-[0.3em] text-[#6b4c52] sm:text-2xl"
            role="heading"
            aria-level={1}
          >
            ✦ LARI TAROT ✦
          </span>
          <span className="mt-2 block text-sm text-[#a07880]">당신만을 위한 맞춤 타로 리딩</span>
        </button>

        <div className="mx-auto mt-8 flex max-w-md rounded-full border border-[#f0d0d5] bg-white/60 p-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => onTabChange('reading')}
            className={[
              'flex-1 rounded-full py-3 text-sm font-medium transition-all duration-300',
              activeTab === 'reading'
                ? 'bg-gradient-to-r from-[#c8748a] to-[#d4956a] text-white shadow-md'
                : 'text-[#a07880] hover:text-[#6b4c52]',
            ].join(' ')}
          >
            🔮 타로 리딩
          </button>
          <button
            type="button"
            onClick={() => onTabChange('guestbook')}
            className={[
              'flex-1 rounded-full py-3 text-sm font-medium transition-all duration-300',
              activeTab === 'guestbook'
                ? 'bg-gradient-to-r from-[#c8748a] to-[#d4956a] text-white shadow-md'
                : 'text-[#a07880] hover:text-[#6b4c52]',
            ].join(' ')}
          >
            🪄 방명록
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">{children}</main>

      <footer className="mt-auto px-4 py-8 text-center">
        <div className="mx-auto max-w-lg rounded-full bg-white/50 px-4 py-3 text-[10px] text-[#a07880] backdrop-blur-sm">
          ✦ by @Tarot_Lariatte · powered by Claude ✦
        </div>
      </footer>
    </div>
  )
}
