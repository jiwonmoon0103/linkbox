// 링크 저장 API (POST)
// 근거: PLAN.md 6번, DESIGN.md 3.1 저장 흐름과 6번 서버 기능 명세
//
// 이번 단계에서는 AI를 부르지 않는다. 주소만 저장한다.
// 본문 가져오기와 요약은 PLAN 11~12번에서 붙인다.
//
// 처리 순서
//   1) 비밀번호 확인 (차단 중이면 여기서 끝)
//   2) 주소 형식 검사 + https 보완 + 추적 파라미터 제거
//   3) 이미 저장된 주소인지 확인
//   4) 저장

import { NextResponse, type NextRequest } from 'next/server'
import { authorize, getClientIp, createSessionToken, sessionCookieOptions } from '@/lib/auth'
import { db, fetchLinks } from '@/lib/db'
import { normalizeUrl } from '@/lib/url'
import {
  ERROR_MESSAGES,
  SESSION_COOKIE_NAME,
  type ErrorCode,
  type Link,
} from '@/lib/constants'

/** 실패 응답을 한 가지 모양으로 만든다. */
function fail(code: ErrorCode, status: number) {
  return NextResponse.json(
    { error: { code, message: ERROR_MESSAGES[code] } },
    { status }
  )
}

/**
 * 목록 조회 (GET)
 * 최신순으로 20개씩 돌려주고, 더 남았는지도 함께 알려준다.
 * 비밀번호 없이 누구나 볼 수 있다. (열람은 공개)
 *
 * offset: 건너뛸 개수. "더 보기"를 누를 때마다 20씩 늘려 보낸다.
 */
export async function GET(request: NextRequest) {
  const raw = Number(request.nextUrl.searchParams.get('offset') ?? 0)
  const offset = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0

  try {
    // 첫 화면(app/page.tsx)과 같은 함수를 써서 정렬과 개수가 어긋나지 않게 한다.
    const { links, hasMore } = await fetchLinks(offset)
    return NextResponse.json({ data: links, hasMore })
  } catch {
    return fail('SERVER_ERROR', 500)
  }
}

export async function POST(request: NextRequest) {
  let body: { url?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return fail('INVALID_URL', 400)
  }

  // 1) 비밀번호 확인
  const auth = await authorize({
    ip: getClientIp(request.headers),
    password: body.password,
    token: request.cookies.get(SESSION_COOKIE_NAME)?.value,
  })

  if (!auth.ok) {
    return fail(auth.code, auth.code === 'BLOCKED' ? 429 : 401)
  }

  // 2) 주소 검사와 정규화
  const normalized = normalizeUrl(body.url)
  if (!normalized.ok) {
    return fail('INVALID_URL', 400)
  }

  try {
    // 3) 이미 저장된 주소인지 확인
    const { data: existing } = await db
      .from('links')
      .select('*')
      .eq('url', normalized.url)
      .maybeSingle()

    if (existing) {
      // 이미 있으면 새로 저장하지 않고 기존 카드를 함께 돌려준다.
      return NextResponse.json(
        {
          error: { code: 'DUPLICATE', message: ERROR_MESSAGES.DUPLICATE },
          data: existing as Link,
        },
        { status: 409 }
      )
    }

    // 4) 저장 — 지금은 제목, 요약, 태그를 비워둔다. (AI는 아직 붙이지 않음)
    const { data: created, error } = await db
      .from('links')
      .insert({ url: normalized.url, title: '', summary: '', tags: [] })
      .select('*')
      .single()

    if (error || !created) {
      return fail('SERVER_ERROR', 500)
    }

    const response = NextResponse.json({ data: created as Link }, { status: 201 })

    // 비밀번호로 통과했으면 1시간짜리 쿠키를 내려보내 다시 묻지 않는다.
    if (auth.issueCookie) {
      response.cookies.set({
        ...sessionCookieOptions,
        value: createSessionToken(),
      })
    }

    return response
  } catch {
    return fail('SERVER_ERROR', 500)
  }
}
