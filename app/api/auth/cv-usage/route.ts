import { NextRequest, NextResponse } from 'next/server'
import {
  attachCvViewerCookie,
  getActiveCvViewerSession,
  getCvViewerUsage,
} from '@/lib/cv-viewer'

/**
 * 현재 viewer 의 CV 리딩 사용 이력 조회 (활성 cv_auth 쿠키가 가리키는 비번 기준).
 * cv_viewer 로 인증된 클라이언트가 페이지 진입 시 호출하여 상단 배너 카운트를 표시한다.
 *
 * cv_auth 쿠키가 없거나 가리키는 비번이 비활성화/만료되었으면 401.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getActiveCvViewerSession(req)
    if (!session) {
      return NextResponse.json({ error: 'cv_viewer 세션이 아닙니다.' }, { status: 401 })
    }

    const usage = await getCvViewerUsage(
      session.passwordId,
      session.viewerId,
      session.maxUsesPerViewer
    )

    const res = NextResponse.json({
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    })
    // cv_viewer_id 쿠키가 fallback id 로 잡혀있다면 다음 요청부터 안정적인 random id 로 옮기기
    // (resolveCvViewerId 가 getActiveCvViewerSession 내부에서 처리된 viewerId 와 동일)
    // 이미 쿠키가 있으면 그대로, 없으면 신규 발급
    if (!req.cookies.get('cv_viewer_id')) {
      // 안정적인 ID 발급 (다음 요청 동기화용)
      const fresh = session.viewerId
      attachCvViewerCookie(res, fresh)
    }
    return res
  } catch (error) {
    console.error('[/api/auth/cv-usage] error:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
