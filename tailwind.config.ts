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
      /**
       * OvO TAROT 소프트 모노 팔레트 (Tailwind에서 `bg-ovo-bg`처럘 참조 가능).
       * 화면 대부분은 여전히 임의 값(hex) 클래스를 쓰지만, 여기 두면 재사용·문서화에 좋습니다.
       */
      colors: {
        ovo: {
          bg: '#f5f5f7',
          card: '#ffffff',
          point: '#4a6fa5',
          point2: '#6b7fa3',
          text: '#2c2c2e',
          muted: '#6e6e73',
          border: '#e0e0e5',
          surface: '#ffffff',
          /** 마크다운 핵심 조언(blockquote) 배경 */
          advice: '#eef1f8',
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
