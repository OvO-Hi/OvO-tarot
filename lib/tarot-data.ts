import { query } from './db'
import type { TarotCard, Category } from '@/types/tarot'

/** 전체 카드 목록 조회 */
export async function getAllCards(): Promise<TarotCard[]> {
  return query<TarotCard>('SELECT * FROM tarot_cards ORDER BY id')
}

/** 특정 카드 조회 */
export async function getCardById(id: number): Promise<TarotCard | null> {
  const rows = await query<TarotCard>('SELECT * FROM tarot_cards WHERE id = $1', [id])
  return rows[0] ?? null
}

/** N장 랜덤 카드 뽑기 (중복 없음) */
export async function drawRandomCards(count: number): Promise<TarotCard[]> {
  return query<TarotCard>(
    'SELECT * FROM tarot_cards ORDER BY RANDOM() LIMIT $1',
    [count]
  )
}

/** 카드 + 역방향 여부 결합 */
export function assignReversals(cards: TarotCard[]): { card: TarotCard; isReversed: boolean }[] {
  return cards.map((card) => ({
    card,
    isReversed: Math.random() < 0.3, // 30% 확률로 역방향
  }))
}

/** 카테고리별 카드 텍스트 추출 */
export function getCardCategoryText(card: TarotCard, categories: Category[]): string {
  const lines: string[] = []

  for (const cat of categories) {
    const text = card[cat]
    if (text) {
      lines.push(`[${getCategoryKo(cat)}] ${text}`)
    }
  }

  // 해당 카테고리 데이터가 없으면 기본 정보 사용
  if (lines.length === 0) {
    const fallback = [
      card.core_message && `핵심 메시지: ${card.core_message}`,
      card.keywords && `키워드: ${card.keywords}`,
      card.reading_script && `리딩 스크립트: ${card.reading_script}`,
    ]
      .filter(Boolean)
      .join('\n')
    return fallback || '(카드 기본 정보 없음)'
  }

  return lines.join('\n')
}

function getCategoryKo(cat: Category): string {
  const map: Record<Category, string> = {
    love: '연애',
    feelings: '마음',
    reunion: '재회',
    contact: '연락',
    career: '직업/진로',
    health: '건강',
    business: '사업',
    money: '금전',
  }
  return map[cat]
}
