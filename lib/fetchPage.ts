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
import {
  FETCH_TIMEOUT_MS,
  MAX_BODY_CHARS,
  MIN_BODY_CHARS,
} from './constants.ts'

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
  let response: Response

  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      // 15초 안에 응답이 없으면 여기서 중단된다. 무한정 기다리지 않는다.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    // 시간 초과, 주소를 찾지 못함, 연결 끊김 등
    return { ok: false }
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
  const title = $('title').first().text().trim()

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
