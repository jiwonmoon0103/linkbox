// 주소 검사와 정규화 담당 파일
// 근거: PRD.md 5번(주소 형식 검사, https 보완, 추적 파라미터 제거), 9번(url 정규화 규칙)
//
// 같은 페이지를 가리키는 주소를 하나로 맞춰야 중복 저장을 제대로 막을 수 있다.

import { TRACKING_PARAMS, TRACKING_PARAM_PREFIXES } from './constants.ts'

export type NormalizeResult =
  | { ok: true; url: string }
  | { ok: false }

/**
 * 입력한 주소를 검사하고 정규화한다.
 *
 * 하는 일
 *   - 앞뒤 공백 제거
 *   - https:// 가 없으면 붙여서 시도
 *   - http, https 가 아닌 주소는 거절 (예: javascript:, ftp:)
 *   - 호스트를 소문자로
 *   - # 뒤 조각 제거
 *   - 끝의 / 제거
 *   - utm_로 시작하는 파라미터와 fbclid, gclid, ref 제거
 */
export function normalizeUrl(input: string | undefined | null): NormalizeResult {
  if (!input) return { ok: false }

  const trimmed = input.trim()
  if (!trimmed) return { ok: false }

  // https:// 가 빠진 주소는 붙여서 시도한다. (흔한 입력 습관)
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(withScheme)
  } catch {
    return { ok: false }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false }
  }

  // 점이 없는 호스트(예: localhost, 그냥 글자)는 주소로 보지 않는다.
  if (!parsed.hostname.includes('.')) return { ok: false }

  // 추적용 파라미터 제거
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase()
    const isTracking =
      TRACKING_PARAMS.includes(lower as (typeof TRACKING_PARAMS)[number]) ||
      TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
    if (isTracking) parsed.searchParams.delete(key)
  }

  // # 뒤 조각은 같은 페이지 안의 위치일 뿐이라 지운다.
  parsed.hash = ''

  // 끝의 / 는 있으나 없으나 같은 페이지다.
  if (parsed.pathname.endsWith('/') && parsed.pathname !== '/') {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }
  if (parsed.pathname === '/') parsed.pathname = ''

  return { ok: true, url: parsed.toString() }
}
