'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useCallback, useState } from 'react'

/** 메인 페이지에서 사용하는 사용자 역할.  cv_viewer 는 CV 공개용 비밀번호로 들어온 외부 채용 검토자. */
export type AuthRole = 'admin' | 'user' | 'cv_viewer'

export type CvViewerUsage = {
  used: number
  limit: number
  remaining: number
}

export type AuthSuccessPayload =
  | { role: 'admin' }
  | { role: 'user' }
  | { role: 'cv_viewer'; usage: CvViewerUsage; expiresAt: number }

export interface PasswordGateProps {
  /** 검증 성공 시 부모(page)가 role + (cv_viewer면 usage/expiresAt) 를 받아 메인 화면으로 넘깁니다 */
  onSuccess: (payload: AuthSuccessPayload) => void
}

/**
 * 앱 진입 전 비밀번호 검증 화면입니다.
 * - 관리자는 해시 비교, 일반 사용자는 6자리+만료 시간 검증(/api/auth/verify)을 서버에서 처리합니다.
 * - 만료된 사용자 비밀번호는 서버가 전용 문구를 내려주므로 그대로 표시합니다.
 */
export default function PasswordGate({ onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  /** false면 입력 숨김 + EyeOff(눈 감음), true면 표시 + Eye(눈 뜸) */
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const verify = useCallback(async () => {
    const trimmed = password.trim()
    if (!trimmed) {
      setError('비밀번호를 입력해주세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmed }),
      })
      const data = (await res.json()) as {
        role?: AuthRole | null
        error?: string
        usage?: CvViewerUsage
        expiresAt?: number
      }
      /** verify API는 실패 시에도 200으로 role:null + error를 줄 수 있어(만료 등) 본문을 우선 확인합니다 */
      if (data.role === 'admin' || data.role === 'user') {
        onSuccess({ role: data.role })
        return
      }
      if (data.role === 'cv_viewer' && data.usage && typeof data.expiresAt === 'number') {
        onSuccess({ role: 'cv_viewer', usage: data.usage, expiresAt: data.expiresAt })
        return
      }
      setError(data.error ?? '입장에 실패했습니다.')
      setPassword('')
    } catch {
      setError('네트워크 오류가 발생했습니다.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }, [password, onSuccess])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f5f7] px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#e0e0e5] bg-white/90 p-8 shadow-[0_4px_20px_rgba(74,111,165,0.12)] backdrop-blur-sm">
        <p className="mb-2 text-center font-serif text-lg font-light tracking-[0.3em] text-[#2c2c2e]">
          ✦ OvO TAROT ✦
        </p>
        <p className="mb-6 text-center text-sm text-[#6e6e73]">비밀번호를 입력해주세요</p>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          {/**
           * type="password": 관리자·임시 사용자 모두 입력 내용이 화면에 그대로 노출되지 않게 합니다.
           * inputMode="numeric": 모바일에서 숫자 키패드를 띄워 6자리 임시 비밀번호 입력을 돕습니다(관리자는 문자도 입력 가능).
           */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={64}
              className="w-full rounded-xl border border-[#e0e0e5] bg-[#ffffff] py-3 pl-4 pr-11 text-[#2c2c2e] placeholder:text-[#6e6e73]/60 focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
              placeholder="비밀번호"
              aria-invalid={!!error}
              aria-describedby={error ? 'password-gate-error' : undefined}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-[#6e6e73] transition-colors hover:text-[#2c2c2e] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/30"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {showPassword ? (
                <Eye className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
              )}
            </button>
          </div>

          {error && (
            <p id="password-gate-error" className="text-center text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gradient-to-r from-[#4a6fa5] to-[#6b7fa3] py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(74,111,165,0.22)] transition-opacity disabled:opacity-50"
          >
            {submitting ? '확인 중…' : '입장하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
