// PLAN 11번 확인용 스크립트
// 페이지 가져오기와 본문 추출이 규칙대로 동작하는지 실제 주소로 확인한다.
//
// 실행: node --env-file=.env scripts/check-fetch.mts [주소 ...]
// 주소를 적지 않으면 아래 기본 목록을 쓴다.
//   - 정상 페이지, 404, PDF, 영상처럼 결과가 갈리는 것들을 섞어 두었다.

import { fetchPage } from '../lib/fetchPage.ts'
import { MAX_BODY_CHARS, MIN_BODY_CHARS } from '../lib/constants.ts'

// 15초 제한은 바깥 사이트로는 확인하기 어렵다. (응답 시간이 그때그때 다르다)
// 응답을 주지 않는 서버를 직접 띄워 확인했고, 양쪽 모두 15.0초에 중단됐다.
const DEFAULT_URLS = [
  'https://ko.wikipedia.org/wiki/기계_학습', // 본문이 아주 긴 정상 페이지
  'https://example.com', // 본문이 200자 미만인 페이지
  'https://httpbin.org/status/404', // 읽지 못하는 페이지
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', // PDF
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // 영상
]

const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS

for (const url of urls) {
  const startedAt = Date.now()
  const result = await fetchPage(url)
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  console.log(`\n▶ ${url}`)
  console.log(`  걸린 시간: ${elapsed}초`)

  if (!result.ok) {
    console.log('  결과: 읽지 못함 → "요약 실패"로 저장할 대상')
    continue
  }

  const judgement = result.tooShort
    ? `${MIN_BODY_CHARS}자 미만 → AI 부르지 않음 ("요약 없음")`
    : 'AI에 넘길 대상'

  console.log(`  제목: ${JSON.stringify(result.title.slice(0, 40))}`)
  console.log(`  본문 길이: ${result.text.length}자 (최대 ${MAX_BODY_CHARS})`)
  console.log(`  판정: ${judgement}`)
  console.log(`  본문 앞부분: ${JSON.stringify(result.text.slice(0, 60))}`)
}
