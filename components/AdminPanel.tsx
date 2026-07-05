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

type CvPasswordItem = {
  id: number
  label: string
  password: string | null
  active: boolean
  expiresAt: number
  expiresDate: string
  expired: boolean
  maxUsesPerViewer: number
  createdAt: string
  totalViewers: number
  totalUses: number
  maxUsedByOne: number
}

type CvViewerPreview = {
  viewerIdShort: string
  usageCount: number
  lastUsedAt: string
  firstSeenAt: string
}

/** YYYY-MM-DD 로컬 오늘 날짜 — <input type="date"> min 으로 사용 */
function todayLocalDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatRelativeKo(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  const diff = Date.now() - t
  if (diff < 60_000) return '방금 전'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}시간 전`
  return `${Math.floor(diff / 86_400_000)}일 전`
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

  /**
   * CV 비번 섹션은 admin 비번을 한 번 입력해 "잠금 해제" 한 뒤,
   * 그 비번을 메모리에 들고 cv-* API 호출에 헤더로 첨부합니다.
   * 패널을 닫으면 자동으로 잊어버립니다.
   */
  const [cvAdminPassword, setCvAdminPassword] = useState('') // 잠금 해제용 입력
  const [showCvAdminPassword, setShowCvAdminPassword] = useState(false)
  const [cvUnlocked, setCvUnlocked] = useState(false) // 잠금 해제 성공 여부
  const [cvUnlocking, setCvUnlocking] = useState(false)
  const [cvUnlockError, setCvUnlockError] = useState<string | null>(null)
  /** 잠금 해제된 admin 비번 — 모든 cv-* API 호출 시 헤더 또는 body 로 같이 보냄. */
  const [cvSessionAdmin, setCvSessionAdmin] = useState<string | null>(null)

  const [cvList, setCvList] = useState<CvPasswordItem[] | null>(null)
  const [cvListError, setCvListError] = useState<string | null>(null)
  const [cvListLoading, setCvListLoading] = useState(false)

  /** 비번별로 평문 표시/숨김 토글 */
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set())
  /** 비번별로 viewer 프리뷰 펼침/접힘 + 캐시 */
  const [viewerPreview, setViewerPreview] = useState<
    Record<number, { loading: boolean; viewers: CvViewerPreview[]; error?: string } | undefined>
  >({})
  /** 비번별 인라인 편집 (만료일/한도/라벨/비번/active) 폼 상태 */
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editExpiresDate, setEditExpiresDate] = useState('')
  const [editMaxUses, setEditMaxUses] = useState<string>('')
  const [editNewPassword, setEditNewPassword] = useState('')
  const [editResetUsage, setEditResetUsage] = useState(false)
  const [rowBusyId, setRowBusyId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  /** 새 비번 추가 폼 */
  const [addLabel, setAddLabel] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [addExpiresDate, setAddExpiresDate] = useState('')
  const [addMaxUses, setAddMaxUses] = useState<string>('3')
  const [addError, setAddError] = useState<string | null>(null)
  const [addInfo, setAddInfo] = useState<string | null>(null)
  const [addSubmitting, setAddSubmitting] = useState(false)

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

  type FetchCvListResult = { ok: true } | { ok: false; status: number; message: string }
  const fetchCvList = useCallback<(adminPassword: string) => Promise<FetchCvListResult>>(
    async (adminPassword) => {
      setCvListLoading(true)
      setCvListError(null)
      try {
        const res = await fetch('/api/auth/cv-password', {
          headers: { 'x-admin-password': adminPassword },
        })
        const data = (await res.json().catch(() => ({}))) as {
          items?: CvPasswordItem[]
          error?: string
        }
        if (!res.ok) {
          const message =
            res.status === 401
              ? '관리자 비밀번호가 틀렸습니다.'
              : `서버 오류 (${res.status}): ${data.error ?? '응답 본문 없음'}`
          setCvListError(message)
          setCvList(null)
          return { ok: false, status: res.status, message }
        }
        setCvList(data.items ?? [])
        return { ok: true }
      } catch (e) {
        const message = `네트워크 오류: ${e instanceof Error ? e.message : String(e)}`
        setCvListError(message)
        return { ok: false, status: 0, message }
      } finally {
        setCvListLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!open) return
    void fetchCurrentUserPassword()
  }, [open, fetchCurrentUserPassword])

  /** 패널을 닫으면 CV 잠금도 자동 해제 (메모리에서 admin 비번 제거) */
  useEffect(() => {
    if (open) return
    setCvUnlocked(false)
    setCvSessionAdmin(null)
    setCvAdminPassword('')
    setCvList(null)
    setRevealedIds(new Set())
    setViewerPreview({})
    setEditingId(null)
  }, [open])

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

  /* ──────────────────────  CV 잠금 해제  ────────────────────── */
  const unlockCv = useCallback(async () => {
    setCvUnlockError(null)
    if (!cvAdminPassword) {
      setCvUnlockError('관리자 비밀번호를 입력해 주세요.')
      return
    }
    setCvUnlocking(true)
    try {
      const result = await fetchCvList(cvAdminPassword)
      if (result.ok === true) {
        setCvUnlocked(true)
        setCvSessionAdmin(cvAdminPassword)
        setCvUnlockError(null)
      } else {
        // fetchCvList 가 status 별로 정제된 메시지를 만들어 둠 — 그대로 노출
        const failed = result as { ok: false; status: number; message: string }
        setCvUnlockError(failed.message)
        setCvUnlocked(false)
        setCvSessionAdmin(null)
      }
    } finally {
      setCvUnlocking(false)
    }
  }, [cvAdminPassword, fetchCvList])

  const lockCv = useCallback(() => {
    setCvUnlocked(false)
    setCvSessionAdmin(null)
    setCvAdminPassword('')
    setCvList(null)
    setRevealedIds(new Set())
    setViewerPreview({})
    setEditingId(null)
  }, [])

  /* ──────────────────────  새 비번 추가  ────────────────────── */
  const submitAddCv = useCallback(async () => {
    setAddError(null)
    setAddInfo(null)
    if (!cvSessionAdmin) {
      setAddError('잠금이 풀려 있어야 합니다.')
      return
    }
    if (!addPassword) {
      setAddError('CV 비밀번호를 입력해 주세요.')
      return
    }
    if (!addExpiresDate) {
      setAddError('만료일을 선택해 주세요.')
      return
    }
    let maxUses = 3
    if (addMaxUses) {
      const n = Number(addMaxUses)
      if (!Number.isFinite(n) || n < 1 || n > 100) {
        setAddError('1인당 사용 횟수는 1~100 사이여야 합니다.')
        return
      }
      maxUses = Math.floor(n)
    }
    setAddSubmitting(true)
    try {
      const res = await fetch('/api/auth/cv-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminPassword: cvSessionAdmin,
          password: addPassword,
          label: addLabel || undefined,
          expiresDate: addExpiresDate,
          maxUsesPerViewer: maxUses,
        }),
      })
      const data = (await res.json()) as { error?: string; success?: boolean }
      if (!res.ok || !data.success) {
        setAddError(data.error ?? '추가에 실패했습니다.')
        return
      }
      setAddInfo('추가되었습니다.')
      setAddLabel('')
      setAddPassword('')
      setAddExpiresDate('')
      setAddMaxUses('3')
      await fetchCvList(cvSessionAdmin)
    } catch {
      setAddError('네트워크 오류가 발생했습니다.')
    } finally {
      setAddSubmitting(false)
    }
  }, [cvSessionAdmin, addPassword, addLabel, addExpiresDate, addMaxUses, fetchCvList])

  /* ──────────────────────  비번 평문 토글  ────────────────────── */
  const toggleRevealed = useCallback((id: number) => {
    setRevealedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /* ──────────────────────  viewer 프리뷰 토글  ────────────────────── */
  const toggleViewerPreview = useCallback(
    async (id: number) => {
      if (!cvSessionAdmin) return
      const cur = viewerPreview[id]
      // 이미 펼쳐져 있으면 접기
      if (cur && !cur.loading) {
        setViewerPreview((prev) => ({ ...prev, [id]: undefined }))
        return
      }
      // 로딩 시작
      setViewerPreview((prev) => ({ ...prev, [id]: { loading: true, viewers: [] } }))
      try {
        const res = await fetch(`/api/auth/cv-password/viewers?passwordId=${id}`, {
          headers: { 'x-admin-password': cvSessionAdmin },
        })
        const data = (await res.json()) as { viewers?: CvViewerPreview[]; error?: string }
        if (!res.ok) {
          setViewerPreview((prev) => ({
            ...prev,
            [id]: { loading: false, viewers: [], error: data.error ?? '오류' },
          }))
          return
        }
        setViewerPreview((prev) => ({
          ...prev,
          [id]: { loading: false, viewers: data.viewers ?? [] },
        }))
      } catch {
        setViewerPreview((prev) => ({
          ...prev,
          [id]: { loading: false, viewers: [], error: '네트워크 오류' },
        }))
      }
    },
    [cvSessionAdmin, viewerPreview]
  )

  /* ──────────────────────  편집 시작/취소  ────────────────────── */
  const startEdit = useCallback((item: CvPasswordItem) => {
    setEditingId(item.id)
    setEditLabel(item.label)
    setEditExpiresDate(item.expiresDate)
    setEditMaxUses(String(item.maxUsesPerViewer))
    setEditNewPassword('')
    setEditResetUsage(false)
    setRowError(null)
  }, [])
  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditLabel('')
    setEditExpiresDate('')
    setEditMaxUses('')
    setEditNewPassword('')
    setEditResetUsage(false)
    setRowError(null)
  }, [])

  /* ──────────────────────  편집 저장  ────────────────────── */
  const submitEdit = useCallback(
    async (id: number) => {
      if (!cvSessionAdmin) return
      setRowError(null)
      const body: Record<string, unknown> = {
        adminPassword: cvSessionAdmin,
        id,
      }
      const original = cvList?.find((i) => i.id === id)
      if (original) {
        if (editLabel !== original.label) body.label = editLabel
        if (editExpiresDate && editExpiresDate !== original.expiresDate)
          body.expiresDate = editExpiresDate
        if (editMaxUses && Number(editMaxUses) !== original.maxUsesPerViewer) {
          const n = Number(editMaxUses)
          if (!Number.isFinite(n) || n < 1 || n > 100) {
            setRowError('1인당 사용 횟수는 1~100 사이여야 합니다.')
            return
          }
          body.maxUsesPerViewer = Math.floor(n)
        }
      }
      if (editNewPassword) {
        body.newPassword = editNewPassword
      }
      if (editResetUsage) body.resetUsage = true

      // 변경 항목 없는지 체크 (resetUsage 만 있어도 OK)
      const keys = Object.keys(body).filter((k) => k !== 'adminPassword' && k !== 'id')
      if (keys.length === 0) {
        setRowError('변경된 항목이 없습니다.')
        return
      }

      setRowBusyId(id)
      try {
        const res = await fetch('/api/auth/cv-password', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = (await res.json()) as { error?: string; success?: boolean }
        if (!res.ok || !data.success) {
          setRowError(data.error ?? '변경에 실패했습니다.')
          return
        }
        cancelEdit()
        await fetchCvList(cvSessionAdmin)
      } catch {
        setRowError('네트워크 오류가 발생했습니다.')
      } finally {
        setRowBusyId(null)
      }
    },
    [cvSessionAdmin, cvList, editLabel, editExpiresDate, editMaxUses, editNewPassword, editResetUsage, cancelEdit, fetchCvList]
  )

  /* ──────────────────────  비활성화 / 활성화  ────────────────────── */
  const toggleActive = useCallback(
    async (id: number, nextActive: boolean) => {
      if (!cvSessionAdmin) return
      setRowBusyId(id)
      setRowError(null)
      try {
        const res = await fetch('/api/auth/cv-password', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword: cvSessionAdmin, id, active: nextActive }),
        })
        const data = (await res.json()) as { error?: string; success?: boolean }
        if (!res.ok || !data.success) {
          setRowError(data.error ?? '변경에 실패했습니다.')
          return
        }
        await fetchCvList(cvSessionAdmin)
      } catch {
        setRowError('네트워크 오류가 발생했습니다.')
      } finally {
        setRowBusyId(null)
      }
    },
    [cvSessionAdmin, fetchCvList]
  )

  /* ──────────────────────  완전 삭제  ────────────────────── */
  const deleteCv = useCallback(
    async (id: number) => {
      if (!cvSessionAdmin) return
      const ok = window.confirm(
        '이 CV 비밀번호를 완전히 삭제할까요?\n\n해당 비번으로 더 이상 접속할 수 없고, 관련된 viewer 사용 이력도 함께 사라집니다. 되돌릴 수 없습니다.'
      )
      if (!ok) return
      setRowBusyId(id)
      setRowError(null)
      try {
        const res = await fetch('/api/auth/cv-password', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminPassword: cvSessionAdmin, id }),
        })
        const data = (await res.json()) as { error?: string; success?: boolean }
        if (!res.ok || !data.success) {
          setRowError(data.error ?? '삭제에 실패했습니다.')
          return
        }
        if (editingId === id) cancelEdit()
        await fetchCvList(cvSessionAdmin)
      } catch {
        setRowError('네트워크 오류가 발생했습니다.')
      } finally {
        setRowBusyId(null)
      }
    },
    [cvSessionAdmin, editingId, cancelEdit, fetchCvList]
  )

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

        <section className="mt-8 rounded-xl border border-[#e0e0e5] bg-[#f5f5f7]/50 p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-[#4a6fa5]">CV 공개용 비밀번호</h3>
            {cvUnlocked && (
              <button
                type="button"
                onClick={lockCv}
                className="rounded-full border border-[#e0e0e5] bg-white px-3 py-1 text-[11px] text-[#6e6e73] hover:bg-[#eef1f8]"
              >
                🔒 잠그기
              </button>
            )}
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-[#6e6e73]">
            CV(이력서)에 여러 비밀번호를 따로 적어 보낼 수 있어요. 회사별로 라벨을 붙여서 관리하면 편해요.
            만료일과 1인당 사용 횟수는 비밀번호마다 따로 설정 가능 · Follow-up 추가 질문은 횟수 차감 X.
          </p>

          {/* ── 잠금 화면 ── */}
          {!cvUnlocked && (
            <div className="rounded-xl border border-[#e0e0e5] bg-white p-4">
              <p className="mb-3 text-xs text-[#6e6e73]">
                보안상 관리자 비밀번호를 한 번 더 확인합니다.
              </p>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showCvAdminPassword ? 'text' : 'password'}
                    value={cvAdminPassword}
                    onChange={(e) => setCvAdminPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void unlockCv()
                    }}
                    placeholder="관리자 비밀번호"
                    className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCvAdminPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] hover:text-[#2c2c2e]"
                    aria-label={showCvAdminPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                  >
                    {showCvAdminPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                </div>
                {cvUnlockError && (
                  <p className="text-xs text-red-600" role="alert">
                    {cvUnlockError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={cvUnlocking}
                  onClick={() => void unlockCv()}
                  className="w-full rounded-full bg-[#4a6fa5] py-2.5 text-sm font-medium text-white hover:bg-[#3a5f95] disabled:opacity-50"
                >
                  {cvUnlocking ? '확인 중…' : '🔓 잠금 해제'}
                </button>
              </div>
            </div>
          )}

          {/* ── 잠금 해제된 화면 ── */}
          {cvUnlocked && (
            <div className="space-y-4">
              {/* 새 비번 추가 폼 */}
              <div className="rounded-xl border border-[#e0e0e5] bg-white p-4">
                <p className="mb-3 text-xs font-medium text-[#2c2c2e]">＋ 새 CV 비밀번호 추가</p>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    placeholder="라벨 (선택, 예: 회사A 제출용)"
                    className="w-full rounded-xl border border-[#e0e0e5] bg-white px-3 py-2 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
                  />
                  <div className="relative">
                    <input
                      type={showAddPassword ? 'text' : 'password'}
                      value={addPassword}
                      onChange={(e) => setAddPassword(e.target.value)}
                      placeholder="CV에 적은 비밀번호 그대로"
                      className="w-full rounded-xl border border-[#e0e0e5] bg-white py-2 pl-3 pr-10 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6e6e73] hover:text-[#2c2c2e]"
                    >
                      {showAddPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-[#6e6e73]">만료일</label>
                      <input
                        type="date"
                        value={addExpiresDate}
                        min={todayLocalDateString()}
                        onChange={(e) => setAddExpiresDate(e.target.value)}
                        className="w-full rounded-xl border border-[#e0e0e5] bg-white px-3 py-2 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-[#6e6e73]">1인당 한도</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        value={addMaxUses}
                        onChange={(e) => setAddMaxUses(e.target.value)}
                        className="w-full rounded-xl border border-[#e0e0e5] bg-white px-3 py-2 text-sm text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none focus:ring-2 focus:ring-[#4a6fa5]/20"
                      />
                    </div>
                  </div>
                  {addError && (
                    <p className="text-xs text-red-600" role="alert">
                      {addError}
                    </p>
                  )}
                  {addInfo && !addError && (
                    <p className="text-xs text-emerald-700" role="status">
                      {addInfo}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={addSubmitting}
                    onClick={() => void submitAddCv()}
                    className="w-full rounded-full bg-[#4a6fa5] py-2.5 text-sm font-medium text-white hover:bg-[#3a5f95] disabled:opacity-50"
                  >
                    {addSubmitting ? '추가 중…' : '추가'}
                  </button>
                </div>
              </div>

              {/* 등록된 비번 목록 */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-[#2c2c2e]">
                    등록된 비밀번호{' '}
                    {cvList && (
                      <span className="text-[#6e6e73]">({cvList.length}개)</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => cvSessionAdmin && void fetchCvList(cvSessionAdmin)}
                    className="text-[11px] text-[#4a6fa5] hover:underline"
                  >
                    {cvListLoading ? '새로고침 중…' : '새로고침'}
                  </button>
                </div>
                {rowError && (
                  <p className="mb-2 text-xs text-red-600" role="alert">
                    {rowError}
                  </p>
                )}
                {cvListError && (
                  <p className="mb-2 text-xs text-red-600" role="alert">
                    {cvListError}
                  </p>
                )}
                {cvList && cvList.length === 0 && (
                  <p className="rounded-xl border border-[#e0e0e5] bg-white p-4 text-center text-xs text-[#6e6e73]">
                    아직 등록된 CV 비밀번호가 없어요.
                  </p>
                )}
                <div className="space-y-3">
                  {cvList?.map((item) => {
                    const isEditing = editingId === item.id
                    const isBusy = rowBusyId === item.id
                    const revealed = revealedIds.has(item.id)
                    const preview = viewerPreview[item.id]
                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border bg-white p-3 ${
                          item.active && !item.expired
                            ? 'border-[#e0e0e5]'
                            : 'border-rose-200 bg-rose-50/30'
                        }`}
                      >
                        {/* 헤더: 라벨 + 상태 뱃지 */}
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-[#2c2c2e]">
                            {item.label || <span className="text-[#9aa0a6]">(라벨 없음)</span>}
                          </p>
                          {!item.active ? (
                            <span className="rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[10px] font-medium text-[#6e6e73]">
                              비활성
                            </span>
                          ) : item.expired ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                              만료됨
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              활성
                            </span>
                          )}
                        </div>

                        {/* 비번 평문 */}
                        <div className="mb-2 flex items-center gap-2 rounded-lg bg-[#f5f5f7] px-3 py-2">
                          <span className="text-[11px] text-[#6e6e73]">비밀번호</span>
                          <code className="flex-1 font-mono text-sm text-[#2c2c2e]">
                            {item.password === null
                              ? <span className="text-rose-600">(복호화 실패)</span>
                              : revealed
                                ? item.password
                                : '•'.repeat(Math.max(item.password.length, 6))}
                          </code>
                          <button
                            type="button"
                            onClick={() => toggleRevealed(item.id)}
                            className="text-[#6e6e73] hover:text-[#2c2c2e]"
                            aria-label={revealed ? '숨기기' : '보기'}
                          >
                            {revealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          </button>
                          {revealed && item.password && (
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard.writeText(item.password!)}
                              className="rounded-md border border-[#e0e0e5] bg-white px-2 py-0.5 text-[10px] text-[#4a6fa5] hover:bg-[#eef1f8]"
                            >
                              복사
                            </button>
                          )}
                        </div>

                        {/* 메타 정보 */}
                        <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-[#6e6e73]">
                          <p>
                            <span className="font-medium text-[#2c2c2e]">만료일</span> {item.expiresDate}
                          </p>
                          <p>
                            <span className="font-medium text-[#2c2c2e]">1인당 한도</span>{' '}
                            {item.maxUsesPerViewer} 회
                          </p>
                          <p className="col-span-2">
                            <span className="font-medium text-[#2c2c2e]">누적</span>{' '}
                            {item.totalViewers} 명 · 총 {item.totalUses} 회
                            {item.maxUsedByOne > 0 && ` · 한 사람 최대 ${item.maxUsedByOne} 회`}
                          </p>
                        </div>

                        {/* 인라인 편집 폼 */}
                        {isEditing && (
                          <div className="mt-2 space-y-2 rounded-lg border border-[#e0e0e5] bg-[#f5f5f7]/50 p-2.5">
                            <input
                              type="text"
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              placeholder="라벨"
                              className="w-full rounded-lg border border-[#e0e0e5] bg-white px-2.5 py-1.5 text-xs text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#6e6e73]">만료일</label>
                                <input
                                  type="date"
                                  value={editExpiresDate}
                                  min={todayLocalDateString()}
                                  onChange={(e) => setEditExpiresDate(e.target.value)}
                                  className="w-full rounded-lg border border-[#e0e0e5] bg-white px-2.5 py-1.5 text-xs text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] text-[#6e6e73]">한도</label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={100}
                                  value={editMaxUses}
                                  onChange={(e) => setEditMaxUses(e.target.value)}
                                  className="w-full rounded-lg border border-[#e0e0e5] bg-white px-2.5 py-1.5 text-xs text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none"
                                />
                              </div>
                            </div>
                            <input
                              type="text"
                              value={editNewPassword}
                              onChange={(e) => setEditNewPassword(e.target.value)}
                              placeholder="새 비밀번호 (변경 안 하려면 비워두기)"
                              className="w-full rounded-lg border border-[#e0e0e5] bg-white px-2.5 py-1.5 text-xs text-[#2c2c2e] focus:border-[#4a6fa5] focus:outline-none"
                            />
                            <label className="flex items-center gap-1.5 text-[11px] text-[#2c2c2e]">
                              <input
                                type="checkbox"
                                checked={editResetUsage}
                                onChange={(e) => setEditResetUsage(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-[#e0e0e5] text-[#4a6fa5]"
                              />
                              <span>이 비번의 viewer 사용 이력 초기화</span>
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void submitEdit(item.id)}
                                className="flex-1 rounded-full bg-[#4a6fa5] py-1.5 text-xs font-medium text-white hover:bg-[#3a5f95] disabled:opacity-50"
                              >
                                {isBusy ? '저장 중…' : '저장'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="flex-1 rounded-full border border-[#e0e0e5] bg-white py-1.5 text-xs text-[#6e6e73] hover:bg-[#f5f5f7]"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 액션 버튼들 */}
                        {!isEditing && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => startEdit(item)}
                              className="rounded-full border border-[#e0e0e5] bg-white px-3 py-1 text-[11px] text-[#4a6fa5] hover:bg-[#eef1f8] disabled:opacity-50"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void toggleActive(item.id, !item.active)}
                              className={`rounded-full border px-3 py-1 text-[11px] disabled:opacity-50 ${
                                item.active
                                  ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              }`}
                            >
                              {item.active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void toggleViewerPreview(item.id)}
                              className="rounded-full border border-[#e0e0e5] bg-white px-3 py-1 text-[11px] text-[#6e6e73] hover:bg-[#f5f5f7] disabled:opacity-50"
                            >
                              {preview ? 'viewer 접기' : 'viewer 보기'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void deleteCv(item.id)}
                              className="ml-auto rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              삭제
                            </button>
                          </div>
                        )}

                        {/* viewer 프리뷰 펼침 */}
                        {preview && (
                          <div className="mt-2 rounded-lg border border-[#e0e0e5] bg-[#f5f5f7]/50 p-2.5 text-[11px]">
                            {preview.loading ? (
                              <p className="text-[#6e6e73]">불러오는 중…</p>
                            ) : preview.error ? (
                              <p className="text-rose-600">{preview.error}</p>
                            ) : preview.viewers.length === 0 ? (
                              <p className="text-[#6e6e73]">아직 접속한 viewer가 없어요.</p>
                            ) : (
                              <table className="w-full text-left">
                                <thead className="text-[10px] text-[#6e6e73]">
                                  <tr>
                                    <th className="pb-1">viewer</th>
                                    <th className="pb-1 text-center">사용</th>
                                    <th className="pb-1 text-right">마지막</th>
                                  </tr>
                                </thead>
                                <tbody className="text-[#2c2c2e]">
                                  {preview.viewers.map((v) => (
                                    <tr key={v.viewerIdShort} className="border-t border-[#e0e0e5]/60">
                                      <td className="py-1 font-mono">…{v.viewerIdShort}</td>
                                      <td className="py-1 text-center">
                                        {v.usageCount} / {item.maxUsesPerViewer}
                                      </td>
                                      <td className="py-1 text-right text-[#6e6e73]">
                                        {formatRelativeKo(v.lastUsedAt)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
