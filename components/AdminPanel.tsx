'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export interface AdminPanelProps {
  open: boolean
  onClose: () => void
}

const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30] as const

function formatExpiryKo(expiresAtMs: number): string {
  const d = new Date(expiresAtMs)
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

/** 현재 유효 비밀번호 카드: 요청대로 로케일 기반 시각 표시 */
function formatExpiryTimeKo(expiresAtMs: number): string {
  return new Date(expiresAtMs).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

type CurrentUserPasswordState = {
  active: boolean
  password?: string
  expiresAt?: number
  remainingMinutes?: number
}

/**
 * 관리자 전용 패널: 관리자 비밀번호 변경 + 일반 사용자 임시 비밀번호 발급.
 * 모든 요청은 /api/auth/update 로내며, 실패 시 서버 메시지를 그대로 보여 줍니다.
 */
export default function AdminPanel({ open, onClose }: AdminPanelProps) {
  /** 관리자 비밀번호 변경 폼 */
  const [curAdmin, setCurAdmin] = useState('')
  const [newAdmin, setNewAdmin] = useState('')
  const [confirmAdmin, setConfirmAdmin] = useState('')
  const [adminSectionError, setAdminSectionError] = useState<string | null>(null)
  const [adminSubmitting, setAdminSubmitting] = useState(false)
  /** 비밀번호 필드마다 표시/숨김을 독립적으로 둡니다(한쪽만 펼쳐도 다른 칸은 그대로). */
  const [showCurAdmin, setShowCurAdmin] = useState(false)
  const [showNewAdmin, setShowNewAdmin] = useState(false)
  const [showConfirmAdmin, setShowConfirmAdmin] = useState(false)

  /** 일반 사용자 비밀번호 발급 폼 */
  const [issuerAdmin, setIssuerAdmin] = useState('')
  const [showIssuerAdmin, setShowIssuerAdmin] = useState(false)
  const [durationMinutes, setDurationMinutes] = useState<number>(30)
  const [userSectionError, setUserSectionError] = useState<string | null>(null)
  const [userSubmitting, setUserSubmitting] = useState(false)
  const [issuedPassword, setIssuedPassword] = useState<string | null>(null)
  const [issuedExpiresAt, setIssuedExpiresAt] = useState<number | null>(null)
  const [issuedDuration, setIssuedDuration] = useState<number | null>(null)

  /**
   * GET /api/auth/current-user-password 결과를 보관합니다.
   * 패널을 열 때마다 다시 불러오고, 새 사용자 비밀번호 발급 성공 시에도 즉시 맞춰 갱신합니다.
   */
  const [currentUserPassword, setCurrentUserPassword] = useState<CurrentUserPasswordState | null>(null)

  const fetchCurrentUserPassword = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/current-user-password')
      const data = (await res.json()) as CurrentUserPasswordState & { error?: string }
      if (!res.ok) {
        setCurrentUserPassword({ active: false })
        return
      }
      setCurrentUserPassword({
        active: Boolean(data.active),
        password: data.password,
        expiresAt: data.expiresAt,
        remainingMinutes: data.remainingMinutes,
      })
    } catch {
      setCurrentUserPassword({ active: false })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void fetchCurrentUserPassword()
  }, [open, fetchCurrentUserPassword])

  const adminMismatch = newAdmin.length > 0 && confirmAdmin.length > 0 && newAdmin !== confirmAdmin

  const submitAdminChange = useCallback(async () => {
    setAdminSectionError(null)
    if (adminMismatch) {
      setAdminSectionError('비밀번호가 일치하지 않습니다.')
      return
    }
    setAdminSubmitting(true)
    try {
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'admin',
          currentAdminPassword: curAdmin,
          newPassword: newAdmin,
          confirmPassword: confirmAdmin,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setAdminSectionError(data.error ?? '변경에 실패했습니다.')
        return
      }
      setCurAdmin('')
      setNewAdmin('')
      setConfirmAdmin('')
      setAdminSectionError(null)
    } catch {
      setAdminSectionError('네트워크 오류가 발생했습니다.')
    } finally {
      setAdminSubmitting(false)
    }
  }, [adminMismatch, curAdmin, newAdmin, confirmAdmin])

  const submitUserIssue = useCallback(async () => {
    setUserSectionError(null)
    setIssuedPassword(null)
    setIssuedExpiresAt(null)
    setIssuedDuration(null)
    setUserSubmitting(true)
    try {
      const res = await fetch('/api/auth/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          adminPassword: issuerAdmin,
          durationMinutes,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        password?: string
        expiresAt?: number
        durationMinutes?: number
      }
      if (!res.ok) {
        setUserSectionError(data.error ?? '발급에 실패했습니다.')
        return
      }
      if (data.password && typeof data.expiresAt === 'number') {
        setIssuedPassword(data.password)
        setIssuedExpiresAt(data.expiresAt)
        setIssuedDuration(data.durationMinutes ?? durationMinutes)
        /** 서버에 저장된 값과 동일한 스냅샷으로 “현재 유효한 비밀번호” 카드를 바로 맞춥니다 */
        setCurrentUserPassword({
          active: true,
          password: data.password,
          expiresAt: data.expiresAt,
          remainingMinutes: Math.max(0, Math.ceil((data.expiresAt - Date.now()) / 60_000)),
        })
      }
    } catch {
      setUserSectionError('네트워크 오류가 발생했습니다.')
    } finally {
      setUserSubmitting(false)
    }
  }, [issuerAdmin, durationMinutes])

  const copyIssued = useCallback(async () => {
    if (!issuedPassword) return
    try {
      await navigator.clipboard.writeText(issuedPassword)
    } catch {
      setUserSectionError('복사에 실패했습니다. 직접 선택해 복사해 주세요.')
    }
  }, [issuedPassword])

  const copyCurrentUserPassword = useCallback(async () => {
    const pw = currentUserPassword?.password
    if (!pw) return
    try {
      await navigator.clipboard.writeText(pw)
    } catch {
      setUserSectionError('복사에 실패했습니다. 직접 선택해 복사해 주세요.')
    }
  }, [currentUserPassword?.password])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-8 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-panel-title"
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e0e0e5] bg-[#ffffff] p-6 shadow-[0_8px_40px_rgba(74,111,165,0.2)]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id="admin-panel-title" className="text-base font-semibold text-[#2c2c2e]">
            ⚙ 관리자 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-[#e0e0e5] px-3 py-1 text-xs text-[#6e6e73] hover:bg-[#f5f5f7]"
          >
            닫기
          </button>
        </div>

        <section className="mb-8 rounded-xl border border-[#e0e0e5] bg-[#f5f5f7]/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-[#4a6fa5]">관리자 비밀번호 변경</h3>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showCurAdmin ? 'text' : 'password'}
                value={curAdmin}
                onChange={(e) => setCurAdmin(e.target.value)}
                placeholder="현재 비밀번호"
                className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              />
              <button
                type="button"
                onClick={() => setShowCurAdmin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] transition-colors hover:text-[#2c2c2e] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 rounded"
                aria-label={showCurAdmin ? '현재 비밀번호 숨기기' : '현재 비밀번호 보기'}
              >
                {showCurAdmin ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showNewAdmin ? 'text' : 'password'}
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                placeholder="새 비밀번호"
                className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              />
              <button
                type="button"
                onClick={() => setShowNewAdmin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] transition-colors hover:text-[#2c2c2e] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 rounded"
                aria-label={showNewAdmin ? '새 비밀번호 숨기기' : '새 비밀번호 보기'}
              >
                {showNewAdmin ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showConfirmAdmin ? 'text' : 'password'}
                value={confirmAdmin}
                onChange={(e) => setConfirmAdmin(e.target.value)}
                placeholder="새 비밀번호 확인"
                className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              />
              <button
                type="button"
                onClick={() => setShowConfirmAdmin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] transition-colors hover:text-[#2c2c2e] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 rounded"
                aria-label={showConfirmAdmin ? '비밀번호 확인 숨기기' : '비밀번호 확인 보기'}
              >
                {showConfirmAdmin ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            {adminMismatch && (
              <p className="text-xs text-red-600" role="alert">
                비밀번호가 일치하지 않습니다
              </p>
            )}
            {adminSectionError && (
              <p className="text-xs text-red-600" role="alert">
                {adminSectionError}
              </p>
            )}
            <button
              type="button"
              disabled={adminSubmitting}
              onClick={() => void submitAdminChange()}
              className="w-full rounded-full bg-[#4a6fa5] py-2.5 text-sm font-medium text-white hover:bg-[#3a5f95] disabled:opacity-50"
            >
              {adminSubmitting ? '처리 중…' : '변경하기'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-[#e0e0e5] bg-[#f5f5f7]/50 p-4">
          <h3 className="mb-3 text-sm font-medium text-[#4a6fa5]">일반 사용자 비밀번호 발급</h3>
          <div className="space-y-3">
            <div className="relative">
              <input
                type={showIssuerAdmin ? 'text' : 'password'}
                value={issuerAdmin}
                onChange={(e) => setIssuerAdmin(e.target.value)}
                placeholder="현재 관리자 비밀번호 (인증용)"
                className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              />
              <button
                type="button"
                onClick={() => setShowIssuerAdmin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] transition-colors hover:text-[#2c2c2e] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30 rounded"
                aria-label={showIssuerAdmin ? '관리자 인증 비밀번호 숨기기' : '관리자 인증 비밀번호 보기'}
              >
                {showIssuerAdmin ? <Eye className="h-4 w-4" aria-hidden /> : <EyeOff className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <div>
              <label htmlFor="duration-select" className="mb-1 block text-xs text-[#6e6e73]">
                유효 시간
              </label>
              <select
                id="duration-select"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-[#e0e0e5] bg-white px-3 py-2 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              >
                {DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}분
                  </option>
                ))}
              </select>
            </div>
            {userSectionError && (
              <p className="text-xs text-red-600" role="alert">
                {userSectionError}
              </p>
            )}
            <button
              type="button"
              disabled={userSubmitting}
              onClick={() => void submitUserIssue()}
              className="w-full rounded-full bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {userSubmitting ? '생성 중…' : '비밀번호 생성'}
            </button>

            {issuedPassword && issuedExpiresAt != null && issuedDuration != null && (
              <div className="mt-4 rounded-xl border border-[#e0e0e5] bg-white p-4 text-center">
                <p className="mb-1 text-xs text-[#6e6e73]">발급된 비밀번호</p>
                <p className="mb-3 font-mono text-3xl font-semibold tracking-widest text-[#4a6fa5]">
                  {issuedPassword}
                </p>
                <p className="mb-3 text-xs text-[#2c2c2e]">
                  {issuedDuration}분 후 만료 ({formatExpiryKo(issuedExpiresAt)}까지 사용 가능)
                </p>
                <button
                  type="button"
                  onClick={() => void copyIssued()}
                  className="rounded-full border border-[#4a6fa5] px-4 py-1.5 text-xs font-medium text-[#4a6fa5] hover:bg-[#eef1f8]"
                >
                  복사
                </button>
              </div>
            )}

            {/**
             * 서버 GET으로 조회한 “지금 DB에 올라가 있는” 사용자 임시 비밀번호입니다.
             * active가 false면(만료·미설정) 아무 것도 그리지 않습니다.
             */}
            {currentUserPassword?.active === true &&
              currentUserPassword.password != null &&
              typeof currentUserPassword.expiresAt === 'number' && (
                <div className="mt-4 rounded-xl bg-[#eef1f8] p-4">
                  <p className="mb-2 text-xs text-[#6e6e73]">현재 유효한 비밀번호</p>
                  <p className="mb-2 text-center font-mono text-2xl font-bold tracking-widest text-[#2c2c2e]">
                    {currentUserPassword.password}
                  </p>
                  <p className="mb-3 text-center text-sm text-[#6e6e73]">
                    {formatExpiryTimeKo(currentUserPassword.expiresAt)}까지 유효 (
                    {typeof currentUserPassword.remainingMinutes === 'number'
                      ? currentUserPassword.remainingMinutes
                      : Math.max(0, Math.ceil((currentUserPassword.expiresAt - Date.now()) / 60_000))}
                    분 남음)
                  </p>
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void copyCurrentUserPassword()}
                      className="rounded-full border border-[#4a6fa5] bg-white px-3 py-1 text-xs font-medium text-[#4a6fa5] hover:bg-[#ffffff]/80"
                    >
                      복사
                    </button>
                  </div>
                </div>
              )}
          </div>
        </section>
      </div>
    </div>
  )
}
