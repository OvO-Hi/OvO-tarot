/**
 * Next.js는 빌드 시 PostCSS를 거쳐 Tailwind를 처리합니다.
 * .mjs만 있을 때 일부 환경에서 설정을 못 찾는 경우가 있어,
 * Next/PostCSS가 가장 잘 읽는 CommonJS 형식으로 두고,
 * tailwind.config.ts 경로를 명시해 스타일이 확실히 생성되게 했습니다.
 */
module.exports = {
  plugins: {
    tailwindcss: {
      config: './tailwind.config.ts',
    },
    autoprefixer: {},
  },
}
