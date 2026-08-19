// 저장 직전 값(buildLink)이 갈래별로 규칙대로 만들어지는지 확인한다.
// DB에는 아무것도 쓰지 않는다.
//
// 실행: node --conditions=react-server --env-file=.env scripts/check-buildlink.mts [주소 ...]
//
// 주의: 본문이 있는 주소는 AI를 1회 부른다. (요금이 든다)

import { buildLink } from '../lib/buildLink.ts'
import { SUMMARY_FAILED, SUMMARY_NONE } from '../lib/constants.ts'

const DEFAULT_URLS = [
  // 본문이 짧지만 제목이 있다 → 제목만으로 태그를 받아야 한다
  'https://shopping.naver.com/window-products/kurlynmart/12274652430',
  // 본문도 제목도 없다 → AI를 부르지 않고 태그는 빈 배열이어야 한다
  'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
  // 읽지 못한다 → "요약 실패", 태그 빈 배열
  'https://httpbin.org/status/404',
]

const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS

for (const url of urls) {
  const startedAt = Date.now()
  const link = await buildLink(url)
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

  const 갈래 =
    link.summary === SUMMARY_FAILED
      ? '요약 실패'
      : link.summary === SUMMARY_NONE
        ? '요약 없음'
        : '요약 있음'

  console.log(`\n▶ ${url}`)
  console.log(`  갈래   : ${갈래} (${elapsed}초)`)
  console.log(`  제목   : ${JSON.stringify(link.title.slice(0, 55))}`)
  console.log(`  요약   : ${JSON.stringify(link.summary.replaceAll('\n', ' / ').slice(0, 70))}`)
  console.log(`  태그   : ${link.tags.length ? link.tags.join(', ') : '(없음)'}`)
}
