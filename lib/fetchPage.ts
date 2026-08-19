// 페이지 가져오기 + 본문 추출 담당 파일
// 근거: PRD.md 5번 1)(AI가 지켜야 할 규칙), DESIGN.md 3.1의 ⑤~⑦
//
// 이 파일은 서버에서만 쓴다. AI는 여기서 부르지 않는다. (PLAN 12번에서 붙인다)
//
// 고정된 숫자는 전부 lib/constants.ts에서 가져온다. 여기 직접 적지 않는다.
//   - 15초를 넘기면 중단한다
//   - 본문은 앞에서부터 5,000자까지만 쓴다
//   - 본문이 200자 미만이면 AI를 부르지 않는다고 알린다

import * as cheerio from 'cheerio'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_CHARS,
  MAX_REDIRECTS,
  MAX_TITLE_CHARS,
  MIN_BODY_CHARS,
} from './constants.ts'

// ---------------------------------------------------------------
// 내부 주소 막기
//
// 이 파일은 사용자가 준 주소로 서버가 직접 요청을 보낸다.
// 막지 않으면 http://127.0.0.1:3000 이나 클라우드 설정 주소처럼
// 바깥에서 닿을 수 없는 곳에 서버 대신 요청을 보내게 할 수 있고,
// 그 응답이 요약되어 공개 목록에 실린다.
//
// 주소 글자만 봐서는 막을 수 없다. 두 가지 때문이다.
//   - 겉보기엔 평범한 이름이 내부 주소를 가리킬 수 있다 (이름 조회를 해봐야 안다)
//   - 정상 주소가 응답으로 "저쪽으로 가라"며 내부 주소를 줄 수 있다 (홉마다 봐야 한다)
// ---------------------------------------------------------------

/** 바깥에서 닿을 수 없는 IPv4 대역들 */
const PRIVATE_V4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // 이 컴퓨터
  ['10.0.0.0', 8], // 사설망
  ['100.64.0.0', 10], // 통신사 내부망
  ['127.0.0.0', 8], // 자기 자신
  ['169.254.0.0', 16], // 링크 로컬 (클라우드 설정 주소가 여기 있다)
  ['172.16.0.0', 12], // 사설망
  ['192.0.0.0', 24], // 특수 용도
  ['192.168.0.0', 16], // 사설망
  ['198.18.0.0', 15], // 성능 시험용
  ['224.0.0.0', 4], // 멀티캐스트
  ['240.0.0.0', 4], // 예약됨
]

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

function isPrivateV4(ip: string): boolean {
  const value = ipv4ToNumber(ip)
  return PRIVATE_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (value & mask) === (ipv4ToNumber(base) & mask)
  })
}

/** 이 IP가 바깥에서 닿을 수 없는 주소인가 */
function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip)

  if (family === 4) return isPrivateV4(ip)

  if (family === 6) {
    const lower = ip.toLowerCase()
    // ::ffff:127.0.0.1 처럼 IPv4를 담은 형태는 그 IPv4로 판단한다.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateV4(mapped[1])

    if (lower === '::1' || lower === '::') return true // 자기 자신
    if (/^f[cd]/.test(lower)) return true // fc00::/7 사설망
    if (/^fe[89ab]/.test(lower)) return true // fe80::/10 링크 로컬
    return false
  }

  // IP 형태가 아니면 판단할 수 없으므로 막는다.
  return true
}

/**
 * 이 호스트가 바깥 주소인지 확인한다.
 * 이름이면 실제로 조회해서 나온 IP를 전부 본다. 하나라도 내부면 막는다.
 *
 * 남는 위험: 조회한 뒤 실제로 연결하기 전에 이름이 가리키는 IP가 바뀔 수 있다.
 * 완전히 막으려면 확인한 IP로 직접 연결해야 하는데, 그건 별도 작업이다.
 */
async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '') // IPv6의 대괄호 제거

  if (isIP(host)) return !isPrivateAddress(host)

  try {
    const addresses = await lookup(host, { all: true })
    if (addresses.length === 0) return false
    return addresses.every((a) => !isPrivateAddress(a.address))
  } catch {
    // 이름을 찾지 못했으면 가져올 수도 없다.
    return false
  }
}

/**
 * ok: false  → 페이지를 아예 읽지 못했다. (404, 15초 초과, 연결 실패 등)
 *              부른 쪽에서 "요약 실패"로 저장한다.
 * ok: true   → 읽었다. tooShort가 true면 본문이 200자 미만이라
 *              AI를 부르지 말고 "요약 없음(본문이 짧은 페이지)"으로 저장한다.
 */
export type PageResult =
  | { ok: false }
  | { ok: true; title: string; text: string; tooShort: boolean }

// 브라우저가 아닌 곳에서 온 요청을 막는 사이트가 있어 이름을 밝혀 둔다.
const USER_AGENT = 'Mozilla/5.0 (compatible; linkbox/1.0)'

/** 본문에서 걷어낼 부분. 메뉴와 광고 글자가 요약에 섞이면 안 된다. */
const NOISE_SELECTOR = 'script, style, noscript, nav, header, footer, aside, iframe, svg, form'

export async function fetchPage(url: string): Promise<PageResult> {
  // 15초는 전체에 대한 제한이다. 주소를 따라 여러 번 옮겨가도 늘어나지 않는다.
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  let response: Response
  let currentUrl = url

  // 주소를 옮길 때마다 그 주소가 바깥 주소인지 다시 확인한다.
  // 처음 한 번만 확인하면, 정상 주소가 내부 주소로 넘기는 것을 막지 못한다.
  for (let hop = 0; ; hop++) {
    let parsed: URL
    try {
      parsed = new URL(currentUrl)
    } catch {
      return { ok: false }
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false }
    }

    if (!(await isPublicHost(parsed.hostname))) {
      // 내부 주소다. 가져오지 않는다. 부른 쪽에서 "요약 실패"로 저장한다.
      return { ok: false }
    }

    try {
      response = await fetch(currentUrl, {
        // 직접 따라가야 홉마다 확인할 수 있다.
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
        signal,
      })
    } catch {
      // 시간 초과, 주소를 찾지 못함, 연결 끊김 등
      return { ok: false }
    }

    const location = response.headers.get('location')
    const isRedirect = response.status >= 300 && response.status < 400

    if (!isRedirect || !location) break

    if (hop >= MAX_REDIRECTS) return { ok: false }

    try {
      // 상대 주소로 올 수도 있어 지금 주소를 기준으로 합친다.
      currentUrl = new URL(location, currentUrl).toString()
    } catch {
      return { ok: false }
    }
  }

  // 404, 403(로그인 필요) 등
  if (!response.ok) return { ok: false }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html')) {
    // PDF, 영상, 이미지처럼 글자를 뽑아낼 수 없는 파일이다.
    // 읽기 자체는 성공했으므로 실패가 아니라 "본문이 짧은 경우"로 다룬다.
    return { ok: true, title: '', text: '', tooShort: true }
  }

  let html: string
  try {
    html = await response.text()
  } catch {
    return { ok: false }
  }

  const $ = cheerio.load(html)

  // 제목은 페이지의 title을 그대로 쓴다. 비어 있으면 부른 쪽에서 처리한다.
  // 다만 길이는 여기서 자른다. 남이 만든 값이라 얼마든지 길 수 있고,
  // 이 값이 그대로 AI 요청에 실리기 때문이다.
  const title = $('title').first().text().trim().slice(0, MAX_TITLE_CHARS)

  $(NOISE_SELECTOR).remove()
  // 줄바꿈과 연속 공백을 한 칸으로 눌러 글자 수를 실제 분량에 맞춘다.
  const text = $('body').text().replace(/\s+/g, ' ').trim()

  return {
    ok: true,
    title,
    // 5,000자보다 긴 페이지도 앞에서부터 이만큼만 AI에 넘긴다.
    text: text.slice(0, MAX_BODY_CHARS),
    tooShort: text.length < MIN_BODY_CHARS,
  }
}
