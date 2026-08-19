// 페이지를 읽을 때 각 단계에서 글자가 얼마나 남는지 보는 진단 스크립트.
//
// "요약 없음(본문이 짧은 페이지)"이 나올 때, 그 원인이
//   - 페이지를 아예 못 읽어서인지
//   - 받아온 HTML에 애초에 글이 없어서인지 (자바스크립트로 그리는 페이지)
//   - 걷어내기(nav/header/footer 제거)가 본문까지 지워서인지
// 를 가르기 위해 만들었다.
//
// 실행: node --conditions=react-server scripts/diagnose-fetch.mts [주소 ...]

import * as cheerio from 'cheerio'

const NOISE = 'script, style, noscript, nav, header, footer, aside, iframe, svg, form'
const UA = 'Mozilla/5.0 (compatible; linkbox/1.0)'
const MIN_BODY_CHARS = 200

const DEFAULT_URLS = [
  'https://chatgpt.com/',
  'https://shopping.naver.com/window-products/kurlynmart/12274652430',
  'https://community.cloud.automationanywhere.digital/',
  'https://www.kurly.com/',
  'https://ko.wikipedia.org/wiki/기계_학습', // 잘 되는 것 (대조군)
]

const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS

for (const url of urls) {
  console.log('\n▶', url)

  let res: Response
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    console.log('  연결 실패:', (e as Error).name, '→ "요약 실패"')
    continue
  }

  console.log('  HTTP', res.status, '|', (res.headers.get('content-type') ?? '').split(';')[0])
  if (!res.ok) {
    console.log('  → 여기서 "요약 실패"가 된다')
    continue
  }

  const html = await res.text()
  const $ = cheerio.load(html)

  const title = $('title').first().text().trim()
  const og = ($('meta[property="og:description"]').attr('content') ?? '').trim()
  const desc = ($('meta[name="description"]').attr('content') ?? '').trim()
  const described = og || desc

  const beforeNoise = $('body').text().replace(/\s+/g, ' ').trim().length
  $(NOISE).remove()
  const afterNoise = $('body').text().replace(/\s+/g, ' ').trim().length

  console.log('  HTML 크기        :', html.length.toLocaleString(), '자')
  console.log('  title            :', JSON.stringify(title.slice(0, 45)))
  console.log('  페이지가 밝힌 설명:', described.length, '자', JSON.stringify(described.slice(0, 45)))
  console.log('  본문(걷어내기 전) :', beforeNoise.toLocaleString(), '자')
  console.log('  본문(걷어낸 후)   :', afterNoise.toLocaleString(), '자')

  const finalLen = (described ? described.length + 1 : 0) + afterNoise
  console.log(
    '  → 판정           :',
    finalLen < MIN_BODY_CHARS ? `${finalLen}자 → "요약 없음"` : `${finalLen}자 → AI 호출`
  )

  // 걷어내기가 본문을 크게 깎았다면, 어느 태그가 얼마나 지웠는지 하나씩 재본다.
  if (beforeNoise - afterNoise > 500) {
    console.log('  걷어낸 태그별로 사라진 글자 수:')
    for (const tag of NOISE.split(', ')) {
      const $$ = cheerio.load(html)
      const full = $$('body').text().replace(/\s+/g, ' ').trim().length
      $$(tag).remove()
      const left = $$('body').text().replace(/\s+/g, ' ').trim().length
      const lost = full - left
      if (lost > 0) {
        const share = ((lost / full) * 100).toFixed(1)
        console.log(`    ${tag.padEnd(9)} -${lost.toLocaleString().padStart(8)}자 (${share}%)`)
      }
    }
  }
}
