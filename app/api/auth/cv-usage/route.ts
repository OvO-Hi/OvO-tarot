import { NextRequest, NextResponse } from 'next/server'
import {
  attachCvViewerCookie,
  getCvViewerUsage,
  resolveCvViewerId,
} from '@/lib/cv-viewer'

/**
 * 현재 viewer 의 CV 리딩 사용 이력 조회.
 * cv_viewer 로 인증된 클라이언트가 페이지 진입 시 호출하여 상단 배너 카운트를 표시한다.
 */
export async function GET(req: NextRequest) {
  try {
    const { viewerId, cookieAssigned, freshCookieValue } = resolveCvViewerId(req)
    const usage = await getCvViewerUsage(viewerId)

    const res = NextResponse.json({
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    })
    if (cookieAssigned && freshCookieValue) {
      attachCvViewerCookie(res, freshCookieValue)
    }
    return res
  } catch (error) {
    console.error('[/api/auth/cv-usage] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
