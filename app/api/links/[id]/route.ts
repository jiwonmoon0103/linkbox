// 링크 삭제 API (DELETE)
// 근거: PRD.md 5번 1)(삭제도 비밀번호 확인), DESIGN.md 3.4와 6번 서버 기능 명세
//
// 처리 순서
//   1) 비밀번호 확인 (차단 중이면 여기서 끝)
//   2) 번호 검사
//   3) 삭제 — 없는 링크면 404
//
// 저장과 똑같은 authorize()를 쓴다. 5회 실패 시 10분 차단도 그대로 적용된다.
// "정말 삭제할까요?" 확인은 화면에서 받는다. (components/LinkList.tsx)

import { NextResponse, type NextRequest } from 'next/server'
import {
  authorize,
  getClientIp,
  createSessionToken,
  sessionCookieOptions,
} from '@/lib/auth'
import { db } from '@/lib/db'
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

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<'/api/links/[id]'>
) {
  // 비밀번호는 본문으로 받는다. 주소에 담으면 서버 기록에 남기 때문이다.
  let body: { password?: string } = {}
  try {
    body = await request.json()
  } catch {
    // 본문이 없어도 된다. 쿠키로 통과할 수 있다.
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

  // 2) 번호 검사
  const { id } = await ctx.params
  const linkId = Number(id)
  if (!Number.isInteger(linkId) || linkId <= 0) {
    return fail('NOT_FOUND', 404)
  }

  try {
    // 3) 삭제. 지운 줄을 돌려받아 실제로 있었는지 확인한다.
    const { data: deleted, error } = await db
      .from('links')
      .delete()
      .eq('id', linkId)
      .select('*')
      .maybeSingle()

    if (error) return fail('SERVER_ERROR', 500)
    if (!deleted) return fail('NOT_FOUND', 404)

    const response = NextResponse.json({ data: deleted as Link })

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
