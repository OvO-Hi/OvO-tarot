import type { Config } from 'tailwindcss'

const config: Config = {
  // 프로젝트 루트 기준 — app·components 아래 모든 페이지/컴포넌트 클래스 스캔
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // 향후 src/app 구조로 옮겨도 스캔되도록 (선택적 안전망)
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        lari: {
          bg: '#fdf0f0',
          card: '#fce8e8',
          rose: '#c8748a',
          gold: '#d4956a',
          text: '#6b4c52',
          muted: '#a07880',
          border: '#f0d0d5',
          surface: '#fffafa',
        },
      },
      fontFamily: {
        serif: ['var(--font-noto-serif)', 'serif'],
      },
    },
  },
  plugins: [],
}
export default config
