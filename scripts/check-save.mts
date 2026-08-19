// PLAN 13번 확인용 스크립트
// 저장할 한 줄이 경우마다 규칙대로 만들어지는지, 그리고
// "링크 1건당 AI 호출은 정확히 1회"가 지켜지는지 실제로 세어 확인한다.
//
// 먼저 다른 창에서 가짜 OpenAI 서버를 켜 둔다.
//   node scripts/fake-openai.mts
//
// 그다음 실행:
//   node --conditions=react-server --env-file=.env scripts/check-save.mts
//
// 진짜 OpenAI 대신 가짜 서버를 바라보게 하므로 요금이 들지 않는다.

// lib/ai.ts가 연결을 만들기 전에 주소를 바꿔야 한다. import보다 먼저 둔다.
const COUNTER = 'http://127.0.0.1:4399'
process.env.OPENAI_BASE_URL = `${COUNTER}/v1`

const { buildLink } = await import('../lib/buildLink.ts')
const { SUMMARY_FAILED, SUMMARY_NONE } = await import('../lib/constants.ts')

async function 호출수(): Promise<number> {
  const res = await fetch(`${COUNTER}/count`)
  return (await res.json()).호출수
}

async function 호출수초기화() {
  await fetch(`${COUNTER}/reset`)
}

try {
  await 호출수초기화()
} catch {
  console.error('가짜 OpenAI 서버가 꺼져 있습니다. 먼저 켜 주세요:')
  console.error('  node scripts/fake-openai.mts')
  process.exit(1)
}

const 경우들 = [
  {
    이름: '정상 페이지',
    url: 'https://ko.wikipedia.org/wiki/기계_학습',
    기대호출: 1,
    기대요약: '(AI 요약)',
  },
  {
    이름: '읽지 못하는 페이지 (404)',
    url: 'https://httpbin.org/status/404',
    기대호출: 0,
    기대요약: SUMMARY_FAILED,
  },
  {
    이름: '본문이 짧은 페이지',
    url: 'https://example.com',
    기대호출: 0,
    기대요약: SUMMARY_NONE,
  },
  {
    이름: 'PDF',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    기대호출: 0,
    기대요약: SUMMARY_NONE,
  },
]

let 실패 = 0

for (const 경우 of 경우들) {
  const 전 = await 호출수()
  const 결과 = await buildLink(경우.url)
  const 이번호출 = (await 호출수()) - 전

  const 요약맞음 =
    경우.기대요약 === '(AI 요약)'
      ? 결과.summary !== SUMMARY_FAILED && 결과.summary !== SUMMARY_NONE && 결과.summary !== ''
      : 결과.summary === 경우.기대요약
  const 호출맞음 = 이번호출 === 경우.기대호출
  const 제목있음 = 결과.title !== ''

  if (!요약맞음 || !호출맞음 || !제목있음) 실패 += 1

  console.log(`\n▶ ${경우.이름}`)
  console.log(`  ${호출맞음 ? '✅' : '❌'} AI 호출 ${이번호출}회 (기대 ${경우.기대호출}회)`)
  console.log(`  ${요약맞음 ? '✅' : '❌'} 요약: ${JSON.stringify(결과.summary.slice(0, 50))}`)
  console.log(`  ${제목있음 ? '✅' : '❌'} 제목: ${JSON.stringify(결과.title.slice(0, 50))}`)
  console.log(`     태그: ${JSON.stringify(결과.tags)}`)
}

console.log(`\n총 AI 호출: ${await 호출수()}회 (링크 4건 중 AI 대상은 1건)`)
console.log(실패 === 0 ? '전부 통과.' : `${실패}건 실패.`)
process.exit(실패 === 0 ? 0 : 1)
