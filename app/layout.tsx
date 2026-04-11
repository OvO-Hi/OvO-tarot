import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Noto_Serif_KR } from 'next/font/google'
import './globals.css'

/**
 * Noto Serif KR: .cursorrules에서 지정한 한국어 본문/타이틀용 세리프 폰트입니다.
 * next/font로 불러오면 레이아웃 시프트 없이 안정적으로 적용됩니다.
 */
const notoSerif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700'],
  variable: '--font-noto-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  /** 브라우저 탭·검색 미리보기에 표시되는 사이트 제목 (LARI → OvO 리브랜딩) */
  title: 'OvO TAROT',
  description: '당신만을 위한 맞춤 타로 리딩',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={notoSerif.variable}>
      <body className="min-h-screen bg-[#f5f5f7] font-serif text-[#2c2c2e] antialiased">
        {children}
      </body>
    </html>
  )
}
