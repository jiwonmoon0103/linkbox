// 저장과 삭제에 공통으로 쓰는 비밀번호 확인 담당 파일
// 근거: PRD.md 5번(저장 권한 규칙), DESIGN.md 3.5 비밀번호 확인 흐름
//
// 이 파일은 서버에서만 쓴다. ADMIN_PASSWORD는 브라우저로 나가면 안 된다.
//
// 확인 순서
//   1) 차단 중인 IP인가?            → 차단 중이면 여기서 끝 (AI 호출 없음)
//   2) 서명 쿠키가 유효한가?         → 유효하면 통과
//   3) 비밀번호가 맞는가?            → 맞으면 통과하고 새 쿠키를 내려준다
//   4) 틀렸으면 실패 횟수 +1        → 5회가 되면 10분 차단

import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from './db.ts'
import {
  BLOCK_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  type ErrorCode,
} from './constants.ts'

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    throw new Error('.env에 ADMIN_PASSWORD가 없습니다.')
  }
  return password
}

// ---------------------------------------------------------------
// 1. 비밀번호 대조
// ---------------------------------------------------------------

/**
 * 입력한 비밀번호가 .env의 값과 같은지 확인한다.
 * 글자를 하나씩 비교하면 응답 시간 차이로 값을 추측당할 수 있어,
 * 길이에 상관없이 같은 시간이 걸리는 방식(timingSafeEqual)을 쓴다.
 */
export function verifyPassword(input: string | undefined | null): boolean {
  if (!input) return false

  const expected = Buffer.from(getAdminPassword(), 'utf8')
  const given = Buffer.from(input, 'utf8')

  // 길이가 다르면 비교 자체가 불가능하므로, 길이를 맞춘 뒤 결과를 무효로 만든다.
  if (expected.length !== given.length) {
    timingSafeEqual(expected, expected)
    return false
  }
  return timingSafeEqual(expected, given)
}

// ---------------------------------------------------------------
// 2. 통과 상태를 담는 서명 쿠키
//    브라우저가 "통과했다"고 주장하는 것만으로는 통과시키지 않는다.
//    서버가 ADMIN_PASSWORD로 서명하므로 값을 위조할 수 없다.
// ---------------------------------------------------------------

function sign(payload: string): string {
  return createHmac('sha256', getAdminPassword()).update(payload).digest('hex')
}

/** 만료 시각을 담아 서명한 쿠키 값을 만든다. 모양은 "만료시각.서명" */
export function createSessionToken(now: number = Date.now()): string {
  const expiresAt = String(now + SESSION_TTL_MS)
  return `${expiresAt}.${sign(expiresAt)}`
}

/** 쿠키 값이 위조되지 않았고 아직 만료되지 않았는지 확인한다. */
export function verifySessionToken(
  token: string | undefined | null,
  now: number = Date.now()
): boolean {
  if (!token) return false

  const [expiresAt, signature] = token.split('.')
  if (!expiresAt || !signature) return false

  const expected = Buffer.from(sign(expiresAt), 'utf8')
  const given = Buffer.from(signature, 'utf8')
  if (expected.length !== given.length) return false
  if (!timingSafeEqual(expected, given)) return false

  return Number(expiresAt) > now
}

/** 쿠키를 내려보낼 때 쓰는 설정. HttpOnly라 브라우저 스크립트가 읽지 못한다. */
export const sessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
  secure: process.env.NODE_ENV === 'production',
}

// ---------------------------------------------------------------
// 3. 실패 횟수와 차단 (login_attempts 테이블)
// ---------------------------------------------------------------

/** 요청을 보낸 사람의 IP를 찾는다. Vercel은 x-forwarded-for에 넣어 보낸다. */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return headers.get('x-real-ip') ?? 'unknown'
}

/** 지금 차단 중인 IP인지 확인한다. */
export async function isBlocked(
  ip: string,
  now: number = Date.now()
): Promise<boolean> {
  const { data } = await db
    .from('login_attempts')
    .select('blocked_until')
    .eq('ip', ip)
    .maybeSingle()

  if (!data?.blocked_until) return false
  return new Date(data.blocked_until).getTime() > now
}

/** 비밀번호를 틀렸을 때 기록한다. 5회가 되면 10분간 차단한다. */
export async function recordFailure(
  ip: string,
  now: number = Date.now()
): Promise<void> {
  const { data } = await db
    .from('login_attempts')
    .select('fail_count')
    .eq('ip', ip)
    .maybeSingle()

  const failCount = (data?.fail_count ?? 0) + 1
  const reachedLimit = failCount >= MAX_FAILED_ATTEMPTS

  await db.from('login_attempts').upsert({
    ip,
    fail_count: reachedLimit ? 0 : failCount, // 차단했으면 횟수를 다시 0부터 센다
    last_failed_at: new Date(now).toISOString(),
    blocked_until: reachedLimit
      ? new Date(now + BLOCK_DURATION_MS).toISOString()
      : null,
  })
}

/** 비밀번호를 맞혔을 때 실패 기록을 지운다. */
export async function clearFailures(ip: string): Promise<void> {
  await db.from('login_attempts').delete().eq('ip', ip)
}

// ---------------------------------------------------------------
// 4. 저장·삭제 API가 부르는 입구
// ---------------------------------------------------------------

export type AuthResult =
  | { ok: true; issueCookie: boolean }
  | { ok: false; code: Extract<ErrorCode, 'WRONG_PASSWORD' | 'BLOCKED'> }

/**
 * 저장과 삭제 요청을 통과시킬지 판단한다.
 * issueCookie가 true면 호출한 쪽에서 새 쿠키를 내려보내면 된다.
 */
export async function authorize(params: {
  ip: string
  password?: string | null
  token?: string | null
  now?: number
}): Promise<AuthResult> {
  const now = params.now ?? Date.now()

  // 차단 중이면 비밀번호를 보지도 않는다.
  if (await isBlocked(params.ip, now)) {
    return { ok: false, code: 'BLOCKED' }
  }

  // 1시간 안에 이미 통과했으면 다시 묻지 않는다.
  if (verifySessionToken(params.token, now)) {
    return { ok: true, issueCookie: false }
  }

  if (verifyPassword(params.password)) {
    await clearFailures(params.ip)
    return { ok: true, issueCookie: true }
  }

  await recordFailure(params.ip, now)
  // 이번 실패로 차단됐다면 그 사실을 바로 알려준다.
  if (await isBlocked(params.ip, now)) {
    return { ok: false, code: 'BLOCKED' }
  }
  return { ok: false, code: 'WRONG_PASSWORD' }
}
