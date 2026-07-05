'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminPanel from '@/components/AdminPanel'
import PasswordGate, {
  type AuthRole,
  type AuthSuccessPayload,
  type CvViewerUsage,
} from '@/components/PasswordGate'
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
  /**
   * 접근 제어: null이면 비밀번호 게이트만 보여 주고, 통과 후 admin/user/cv_viewer 역할을 유지합니다.
   * 홈(로고) 클릭 시에도 role은 건드리지 않고 리딩 플로우만 step 1로 되돌립니다.
   */
  const [role, setRole] = useState<AuthRole | null>(null)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)

  /**
   * cv_viewer (CV 공개용 비번으로 들어온 사용자) 의 사용량과 만료 정보.
   * 다른 role 일 때는 항상 null.
   *  - 페이지 진입(로그인 직후): verify API 응답으로 초기값 세팅
   *  - 새 리딩 성공/거부 시: /api/reading 응답의 cvUsage 로 갱신
   */
  const [cvUsage, setCvUsage] = useState<CvViewerUsage | null>(null)
  const [cvExpiresAt, setCvExpiresAt] = useState<number | null>(null)

  const handleAuthSuccess = useCallback((payload: AuthSuccessPayload) => {
    setRole(payload.role)
    if (payload.role === 'cv_viewer') {
      setCvUsage(payload.usage)
      setCvExpiresAt(payload.expiresAt)
    } else {
      setCvUsage(null)
      setCvExpiresAt(null)
    }
  }, [])

  /** 페이지가 다시 활성화되거나 새로 마운트될 때 cv_viewer 사용량 동기화 */
  useEffect(() => {
    if (role !== 'cv_viewer') return
    const refresh = async () => {
      try {
        const res = await fetch('/api/auth/cv-usage')
        if (!res.ok) return
        const data = (await res.json()) as { used: number; limit: number; remaining: number }
        setCvUsage({ used: data.used, limit: data.limit, remaining: data.remaining })
      } catch {
        /* 네트워크 오류 시 그대로 둠 — 다음 리딩 응답에서 갱신될 기회 있음 */
      }
    }
    void refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [role])

  const [tab, setTab] = useState<MainTab>('reading')
  const [step, setStep] = useState<Step>(1)

  const [situation, setSituation] = useState('')
  const [tone, setTone] = useState<Tone>('normal')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [drawnCards, setDrawnCards] = useState<DrawnCard[] | null>(null)
  const [reading, setReading] = useState('')
  const [revealedCount, setRevealedCount] = useState(0)

  /**
   * followup 히스토리:
   * - question/answer에 더해 drawnCards(1~3장)를 저장합니다.
   * - 이 데이터는 FollowupSection에서 "뒷면 → 순차 플립 → 답변 노출" 흐름을 그리는 데 사용됩니다.
   */
  const [followups, setFollowups] = useState<
    { question: string; answer: string; drawnCards?: DrawnCard[] }[]
  >([])
  const [followupLoading, setFollowupLoading] = useState(false)
  /**
   * 추가 질문 입력창의 단일 진실 공급원(state)을 page로 올렸습니다.
   * 이유: ReadingResult의 제안 질문 버튼이 입력값을 채울 때도 동일 state를 갱신해야
   * 수동 입력/자동 채우기/전송 흐름이 서로 충돌하지 않습니다.
   */
  const [followupInput, setFollowupInput] = useState('')

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
      if (!res.ok) {
        // CV 한도 초과 — 응답의 usage 로 배너 즉시 갱신 + 안내 문구.
        if (data?.error === 'cv_limit_exceeded' && data?.usage) {
          setCvUsage({
            used: data.usage.used,
            limit: data.usage.limit,
            remaining: data.usage.remaining,
          })
          throw new Error(data.message ?? '이 비밀번호로는 리딩 횟수를 모두 사용했습니다.')
        }
        throw new Error(data.error || '리딩에 실패했습니다.')
      }
      setDrawnCards(data.drawnCards as DrawnCard[])
      setReading(data.reading as string)
      // cv_viewer 의 경우 응답에 cvUsage 가 포함됨 — 배너 카운트 즉시 갱신.
      if (data?.cvUsage) {
        setCvUsage({
          used: data.cvUsage.used,
          limit: data.cvUsage.limit,
          remaining: data.cvUsage.remaining,
        })
      }
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

  /**
   * 추가 질문 API — { answer, drawnCards } 응답을 받아 followups에 누적합니다.
   * drawnCards가 없거나 형식이 달라도 UI가 깨지지 않도록 배열 여부를 방어적으로 확인합니다.
   */
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
        const nextDrawnCards = Array.isArray(data.drawnCards) ? (data.drawnCards as DrawnCard[]) : []
        setFollowups((prev) => [
          ...prev,
          {
            question: q,
            answer: (data.answer as string) ?? '',
            drawnCards: nextDrawnCards,
          },
        ])
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
    setFollowupInput('')
    setError(null)
  }, [])

  /**
   * 상단 로고(✦ + OvO TAROT) 클릭 시: 리딩 진행 중이면 확인 후 전체 초기화·step 1.
   * step 1이면 확인 없이 바로 초기화(이미 처음이므로 부작용 거의 없음).
   * 방명록 탭이어도 리딩 탭으로 돌아가며 같은 초기화를 적용합니다.
   * role(admin/user)은 resetAll에 포함되지 않으므로 로그인 상태는 유지됩니다.
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

  if (role === null) {
    return <PasswordGate onSuccess={handleAuthSuccess} />
  }

  /** YYYY-MM-DD 한국어 표기 — 배너용 */
  const formatExpiresKo = (ts: number) => {
    const d = new Date(ts)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
      d.getDate()
    ).padStart(2, '0')}`
  }
  const cvSoldOut = role === 'cv_viewer' && cvUsage !== null && cvUsage.remaining <= 0

  return (
    <SiteChrome
      activeTab={tab}
      onTabChange={setTab}
      onHome={handleHome}
      footerAddon={
        role === 'admin' ? (
          <button
            type="button"
            onClick={() => setAdminPanelOpen(true)}
            className="rounded-full border border-[#e0e0e5] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a6fa5] shadow-sm transition-colors hover:bg-[#eef1f8]"
          >
            ⚙ 관리
          </button>
        ) : undefined
      }
    >
      {/* CV 공개용 비번으로 들어온 사용자에게만 보이는 사용 횟수 배너 */}
      {role === 'cv_viewer' && cvUsage && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            cvSoldOut
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
          role="status"
        >
          <p className="font-medium">
            {cvSoldOut
              ? '리딩 횟수를 모두 사용했어요.'
              : `오늘 남은 리딩: ${cvUsage.remaining} / ${cvUsage.limit} 회`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#6e6e73]">
            {cvSoldOut
              ? '이 비밀번호로는 더 이상 새 리딩을 시작할 수 없어요. 이미 본 리딩 결과는 그대로 둘러볼 수 있어요.'
              : `Follow-up 추가 질문은 횟수에 포함되지 않아요.${
                  cvExpiresAt ? ` · 유효: ${formatExpiresKo(cvExpiresAt)}까지` : ''
                }`}
          </p>
        </div>
      )}

      {tab === 'guestbook' ? (
        <div className="rounded-2xl border border-[#e0e0e5] bg-white/60 p-12 text-center text-[#6e6e73] backdrop-blur-sm">
          <p className="mb-2 font-medium text-[#2c2c2e]">방명록</p>
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
            {step === 1 &&
              (cvSoldOut ? (
                <div className="rounded-2xl border border-[#e0e0e5] bg-white/80 p-10 text-center backdrop-blur-sm">
                  <p className="mb-2 text-base font-medium text-[#2c2c2e]">
                    이 비밀번호의 리딩 횟수를 모두 사용했어요.
                  </p>
                  <p className="text-sm leading-relaxed text-[#6e6e73]">
                    더 이상 새 리딩을 시작할 수 없습니다.
                    <br />
                    이미 본 리딩 결과는 다른 탭에서 그대로 둘러볼 수 있어요.
                  </p>
                </div>
              ) : (
                <SituationForm onSubmit={handleSituationSubmit} />
              ))}

            {step === 2 && (
              <div className="rounded-2xl border border-[#e0e0e5] bg-white/60 px-4 backdrop-blur-sm sm:px-8">
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
                    className="rounded-full bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] px-10 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(74,111,165,0.22)] transition-transform duration-300 hover:scale-[1.02]"
                  >
                    리딩 결과 보기 ✦
                  </button>
                </div>
              </div>
            )}

            {step === 5 && analysis && (
              <div className="rounded-2xl border border-[#e0e0e5] bg-white/60 px-4 backdrop-blur-sm sm:px-8">
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
                followupInput={followupInput}
                onFollowupInputChange={setFollowupInput}
                onSuggestQuestion={setFollowupInput}
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
                className="text-xs text-[#6e6e73] underline decoration-[#e0e0e5] underline-offset-4 hover:text-[#2c2c2e]"
              >
                처음부터 다시하기
              </button>
            </div>
          )}
        </>
      )}
      <AdminPanel open={adminPanelOpen} onClose={() => setAdminPanelOpen(false)} />
    </SiteChrome>
  )
}
