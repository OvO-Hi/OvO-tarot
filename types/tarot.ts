export type Tone = 'very-gentle' | 'gentle' | 'normal' | 'direct' | 'very-direct'

export const TONE_LABELS: Record<Tone, string> = {
  'very-gentle': '아주 부드럽게 🌸',
  'gentle': '부드럽게 🌿',
  'normal': '표준 🌙',
  'direct': '직설적으로 ⚡',
  'very-direct': '아주 직설적으로 🔥',
}

export const TONE_DESCRIPTIONS: Record<Tone, string> = {
  'very-gentle': '위로와 공감 중심, 부드럽고 따뜻하게',
  'gentle': '친근하고 다정하게',
  'normal': '균형 잡힌 일반적인 말투',
  'direct': '솔직하고 직접적으로',
  'very-direct': '꾸밈없이 매우 직설적으로',
}

export interface SpreadPosition {
  position: number
  meaning: string
}

export interface Spread {
  name: string
  cardCount: number
  positions: SpreadPosition[]
}

export interface TarotCard {
  id: number
  name_ko: string
  core_message: string | null
  keywords: string | null
  story: string | null
  love: string | null
  feelings: string | null
  reunion: string | null
  contact: string | null
  career: string | null
  health: string | null
  business: string | null
  money: string | null
  symbol_interpretation: string | null
  reading_script: string | null
  arcana: string
  suit: string | null
  symbol: string
}

export interface DrawnCard {
  card: TarotCard
  position: number
  isReversed: boolean
}

export interface AnalysisResult {
  situationSummary: string
  detectedCategories: string[]
  questions: string[]
  spread: Spread
}

export type Category = 'love' | 'feelings' | 'reunion' | 'contact' | 'career' | 'health' | 'business' | 'money'

export const CATEGORY_LABELS: Record<Category, string> = {
  love: '연애',
  feelings: '마음',
  reunion: '재회',
  contact: '연락',
  career: '직업/진로',
  health: '건강',
  business: '사업',
  money: '금전',
}
