// 페이지가 기계용으로 실어 놓은 설명(JSON-LD, meta 태그)이 있는지 살펴보는 스크립트.
//
// 자바스크립트로 그리는 페이지는 HTML에 사람이 읽을 글이 거의 없다.
// 그런데 검색엔진을 위해 같은 내용을 schema.org 형식(JSON-LD)이나
// meta 태그로 따로 실어두는 곳이 많다. 그것을 쓸 수 있는지 보려는 것이다.
//
// 실행: node --conditions=react-server scripts/diagnose-jsonld.mts [주소 ...]

import * as cheerio from 'cheerio'

const UA = 'Mozilla/5.0 (compatible; linkbox/1.0)'

const DEFAULT_URLS = [
  'https://shopping.naver.com/window-products/kurlynmart/12274652430',
  'https://www.kurly.com/',
  'https://community.cloud.automationanywhere.digital/',
]

const urls = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_URLS

/** 중첩된 JSON에서 글로 쓸 만한 값만 걷어낸다. */
function collectText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || out.length > 40) return out
  if (typeof value === 'string') {
    const t = value.trim()
    if (t.length >= 10 && !t.startsWith('http') && !/^[\d\-.,\s]+$/.test(t)) out.push(t)
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectText(v, out, depth + 1))
  } else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => collectText(v, out, depth + 1))
  }
  return out
}

for (const url of urls) {
  console.log('\n▶', url)

  let html: string
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.log('  HTTP', res.status, '→ 읽지 못함')
      continue
    }
    html = await res.text()
  } catch {
    console.log('  연결 실패')
    continue
  }

  const $ = cheerio.load(html)

  // 1) JSON-LD
  const blocks = $('script[type="application/ld+json"]')
  console.log('  JSON-LD 덩어리:', blocks.length, '개')
  blocks.each((i, el) => {
    if (i > 2) return
    try {
      const parsed = JSON.parse($(el).text())
      const texts = collectText(parsed)
      const joined = texts.join(' · ')
      console.log(`    [${i}] 글로 쓸 만한 값 ${texts.length}개, 합쳐서 ${joined.length}자`)
      console.log(`        ${JSON.stringify(joined.slice(0, 120))}`)
    } catch {
      console.log(`    [${i}] JSON으로 읽지 못함`)
    }
  })

  // 2) meta 태그 전반
  const metas: string[] = []
  $('meta').each((_, el) => {
    const name = $(el).attr('property') ?? $(el).attr('name') ?? ''
    const content = ($(el).attr('content') ?? '').trim()
    if (!content || content.length < 15) return
    if (/description|title|keywords|subject/i.test(name)) {
      metas.push(`${name}(${content.length}자): ${content.slice(0, 70)}`)
    }
  })
  console.log('  쓸 만한 meta 태그:', metas.length, '개')
  metas.slice(0, 5).forEach((m) => console.log('    -', m))
}
