'use client'

import { useCallback, useState } from 'react'
import SiteChrome, { type MainTab } from '@/components/SiteChrome'
import SituationForm from '@/components/SituationForm'
import StepLoading from '@/components/StepLoading'
import SpreadAnalysis from '@/components/SpreadAnalysis'
import CardSpread from '@/components/CardSpread'
import ReadingResult from '@/components/ReadingResult'
import type { AnalysisResult, DrawnCard, Tone } from '@/types/tarot'

/**
 * 단계 번호 의미 (.cursorrules와 동일)
 * 1 입력 → 2 분석 로딩 → 3 분석 결과 → 5 카드 뽑기 로딩 → 4 카드 공개 → 6 리딩 결과
 *
 * 왜 순서를 이렇게 바꿨나?
 * - 요구사항에 맞춰 /api/reading은 step 3의 "카드 뽑기" 시점에 딱 1번 호출합니다.
 * - 응답으로 받은 실제 카드/reading을 들고 step 4로 가서 뒷면 배치 + 순차 뒤집기를 수행합니다.
 */
type Step = 1 | 2 | 3 | 4 | 5 | 6

export default function HomePage() {
  const [tab, setTab] = useState<MainTab>('reading')
  const [step, setStep] = useState<Step>(1)

  const [situation, setSituation] = useState('')
  const [tone, setTone] = useState<Tone>('normal')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [drawnCards, setDrawnCards] = useState<DrawnCard[] | null>(null)
  const [reading, setReading] = useState('')
  const [revealedCount, setRevealedCount] = useState(0)

  const [followups, setFollowups] = useState<{ question: string; answer: string }[]>([])
  const [followupLoading, setFollowupLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)

  /** 1단계 제출: 상황 분석 API 호출 후 3단계로 이동 */
  const handleSituationSubmit = useCallback(async (text: string, t: string) => {
    setError(null)
    setSituation(text)
    setTone(t as Tone)
    setStep(2)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation: text, tone: t }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '분석에 실패했습니다.')
      setAnalysis(data as AnalysisResult)
      setStep(3)
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석에 실패했습니다.')
      setStep(1)
    }
  }, [])

  /**
   * step 3의 "카드 뽑기" 버튼에서 호출:
   * - /api/reading을 단 1회 호출
   * - 실제 drawnCards + reading을 state에 저장
   * - step 4로 전환해서 카드는 전부 뒷면( revealedCount=0 )으로 시작
   */
  const requestReading = useCallback(async () => {
    if (!analysis) return
    setError(null)
    setFollowups([])
    setRevealedCount(0)
    setStep(5)
    try {
      const res = await fetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation,
          tone,
          spread: analysis.spread,
          detectedCategories: analysis.detectedCategories,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '리딩에 실패했습니다.')
      setDrawnCards(data.drawnCards as DrawnCard[])
      setReading(data.reading as string)
      setStep(4)
    } catch (e) {
      setError(e instanceof Error ? e.message : '리딩에 실패했습니다.')
      setStep(3)
    }
  }, [analysis, situation, tone])

  /** 한 장씩만 앞면으로 — CardSpread에서 “다음 순서”일 때만 호출됩니다 */
  const revealNext = useCallback(() => {
    setRevealedCount((c) => c + 1)
  }, [])

  /** 추가 질문 API — 답변을 followups에 쌓습니다 */
  const handleFollowup = useCallback(
    async (q: string) => {
      setFollowupLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalSituation: situation,
            originalReading: reading,
            followupQuestion: q,
            tone,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '답변에 실패했습니다.')
        setFollowups((prev) => [...prev, { question: q, answer: data.answer as string }])
      } catch (e) {
        setError(e instanceof Error ? e.message : '답변에 실패했습니다.')
      } finally {
        setFollowupLoading(false)
      }
    },
    [situation, reading, tone]
  )

  const resetAll = useCallback(() => {
    setStep(1)
    setSituation('')
    setTone('normal')
    setAnalysis(null)
    setDrawnCards(null)
    setReading('')
    setRevealedCount(0)
    setFollowups([])
    setError(null)
  }, [])

  /**
   * 상단 로고(꽃 + LARI TAROT) 클릭 시: 리딩 진행 중이면 확인 후 전체 초기화·step 1.
   * step 1이면 확인 없이 바로 초기화(이미 처음이므로 부작용 거의 없음).
   * 방명록 탭이어도 리딩 탭으로 돌아가며 같은 초기화를 적용합니다.
   */
  const handleHome = useCallback(() => {
    if (step !== 1) {
      const ok = window.confirm(
        '처음으로 돌아가면 현재 리딩이 사라져요. 계속할까요?'
      )
      if (!ok) return
    }
    resetAll()
    setTab('reading')
  }, [step, resetAll])

  return (
    <SiteChrome activeTab={tab} onTabChange={setTab} onHome={handleHome}>
      {tab === 'guestbook' ? (
        <div className="rounded-2xl border border-[#f0d0d5] bg-white/60 p-12 text-center text-[#a07880] backdrop-blur-sm">
          <p className="mb-2 font-medium text-[#6b4c52]">방명록</p>
          <p className="text-sm">곧 열릴 예정이에요. 지금은 타로 리딩 탭을 이용해 주세요 ✦</p>
        </div>
      ) : (
        <>
          {error && (
            <div
              className="mb-6 rounded-xl border border-red-200 bg-red-50/90 px-4 py-3 text-center text-sm text-red-800"
              role="alert"
            >
              {error}
            </div>
          )}

          <div key={step} className="opacity-100 transition-opacity duration-500">
            {step === 1 && <SituationForm onSubmit={handleSituationSubmit} />}

            {step === 2 && (
              <div className="rounded-2xl border border-[#f0d0d5] bg-white/60 px-4 backdrop-blur-sm sm:px-8">
                <StepLoading
                  title="상황을 분석하고 있어요..."
                  subtitle="맞춤 스프레드를 설계하는 중 (최대 30초)"
                  label="상황 분석 로딩"
                />
              </div>
            )}

            {step === 3 && analysis && (
              <SpreadAnalysis analysis={analysis} onDraw={requestReading} />
            )}

            {step === 4 && analysis && drawnCards && (
              <div className="space-y-8">
                {/**
                 * step 4는 이미 서버에서 받은 "실제 카드"를 보여주되,
                 * revealedCount=0으로 시작하므로 처음에는 전부 뒷면 카드만 보입니다.
                 */}
                <CardSpread
                  spread={analysis.spread}
                  drawnCards={drawnCards}
                  revealedCount={revealedCount}
                  onRevealNext={revealNext}
                />
                <div className="flex justify-center">
                  {/**
                   * 요구사항: 모든 카드를 다 뒤집기 전에도 결과 보기 가능.
                   * 따라서 disabled 없이 언제든 step 6으로 이동시킵니다.
                   */}
                  <button
                    type="button"
                    onClick={() => setStep(6)}
                    className="rounded-full bg-gradient-to-r from-[#c8748a] to-[#d4956a] px-10 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(200,116,138,0.25)] transition-transform duration-300 hover:scale-[1.02]"
                  >
                    리딩 결과 보기 ✦
                  </button>
                </div>
              </div>
            )}

            {step === 5 && analysis && (
              <div className="rounded-2xl border border-[#f0d0d5] bg-white/60 px-4 backdrop-blur-sm sm:px-8">
                <StepLoading
                  title="카드를 뽑고 있어요..."
                  subtitle="카드 배치를 준비하고 리딩을 작성하는 중이에요"
                  label="리딩 로딩"
                />
              </div>
            )}

            {step === 6 && analysis && drawnCards && (
              <ReadingResult
                situation={situation}
                spread={analysis.spread}
                drawnCards={drawnCards}
                revealedCount={revealedCount}
                reading={reading}
                onFollowup={handleFollowup}
                followups={followups}
                followupLoading={followupLoading}
              />
            )}
          </div>

          {tab === 'reading' && step !== 1 && (
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={resetAll}
                className="text-xs text-[#a07880] underline decoration-[#f0d0d5] underline-offset-4 hover:text-[#6b4c52]"
              >
                처음부터 다시하기
              </button>
            </div>
          )}
        </>
      )}
    </SiteChrome>
  )
}
