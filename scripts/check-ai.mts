// PLAN 12번 확인용 스크립트
//
// 실행:
//   node --conditions=react-server --env-file=.env scripts/check-ai.mts
//     → 돈이 들지 않는 부분만 확인한다. 모델이 규칙을 어긴 답을 줬다고 가정하고,
//       저장되는 값이 규칙대로 잘리는지 본다.
//
//   node --conditions=react-server --env-file=.env scripts/check-ai.mts --live <주소>
//     → 실제로 AI를 1회 부른다. (요금이 든다. 한 번에 1건만 부른다)

import { trimSummary, trimTags, summarize } from '../lib/ai.ts'
import { fetchPage } from '../lib/fetchPage.ts'
import {
  MAX_SENTENCE_CHARS,
  MAX_SUMMARY_SENTENCES,
  MAX_TAGS,
  MAX_TAG_CHARS,
} from '../lib/constants.ts'

let 실패 = 0

function 확인(이름: string, 실제: unknown, 기대: unknown) {
  const 같음 = JSON.stringify(실제) === JSON.stringify(기대)
  if (!같음) 실패 += 1
  console.log(`  ${같음 ? '✅' : '❌'} ${이름}`)
  if (!같음) {
    console.log(`     기대: ${JSON.stringify(기대)}`)
    console.log(`     실제: ${JSON.stringify(실제)}`)
  }
}

const live = process.argv[2] === '--live'

if (!live) {
  console.log(`\n[요약] 모델이 규칙을 어겨도 저장값은 규칙을 지키는가`)

  const 긴문장 = '가'.repeat(80)
  확인(
    `${MAX_SENTENCE_CHARS}자 초과 문장은 ${MAX_SENTENCE_CHARS}자에서 자르고 말줄임을 붙인다`,
    trimSummary([긴문장]),
    '가'.repeat(MAX_SENTENCE_CHARS) + '…'
  )
  확인(
    `문장이 ${MAX_SUMMARY_SENTENCES}개를 넘으면 앞 ${MAX_SUMMARY_SENTENCES}개만 남는다`,
    trimSummary(['첫째.', '둘째.', '셋째.', '넷째.', '다섯째.']),
    '첫째.\n둘째.\n셋째.'
  )
  확인('빈 문장과 공백뿐인 문장은 버린다', trimSummary(['첫째.', '', '   ', '둘째.']), '첫째.\n둘째.')
  확인('배열이 아닌 답을 받으면 빈 문자열', trimSummary('문자열이 왔다'), '')
  확인('문장이 없으면 빈 문자열', trimSummary([]), '')

  console.log(`\n[태그] 최대 ${MAX_TAGS}개, 공백 없이 ${MAX_TAG_CHARS}자 이내, 영어는 소문자`)

  확인(`${MAX_TAGS}개를 넘으면 앞 ${MAX_TAGS}개만 남는다`, trimTags(['a', 'b', 'c', 'd', 'e']), ['a', 'b', 'c'])
  확인('영어는 소문자로 바꾼다', trimTags(['AI', 'NextJS']), ['ai', 'nextjs'])
  확인('공백은 지운다', trimTags(['머신 러닝', ' web dev ']), ['머신러닝', 'webdev'])
  확인(`${MAX_TAG_CHARS}자를 넘으면 자른다`, trimTags(['abcdefghijklmnop']), ['abcdefghij'])
  확인('앞에 붙은 #은 떼어낸다', trimTags(['#ai']), ['ai'])
  확인('같은 태그는 하나만 남긴다', trimTags(['AI', 'ai', '#ai']), ['ai'])
  확인('배열이 아닌 답을 받으면 빈 배열', trimTags(null), [])

  console.log(
    실패 === 0 ? '\n전부 통과.' : `\n${실패}건 실패.`
  )
  process.exit(실패 === 0 ? 0 : 1)
}

// --- 실제 호출 (요금이 든다) ---

const url = process.argv[3]
if (!url) {
  console.error('--live 뒤에 주소를 적어 주세요.')
  process.exit(1)
}

const page = await fetchPage(url)
if (!page.ok || page.tooShort) {
  console.log('AI를 부르지 않는 경우다:', page.ok ? '본문이 짧음' : '읽지 못함')
  process.exit(0)
}

console.log(`제목(페이지): ${JSON.stringify(page.title)}`)
console.log(`본문 길이: ${page.text.length}자`)
console.log('AI 호출 1회 시작...')

const result = await summarize(page.title, page.text)

console.log('\n--- 저장될 값 ---')
console.log(`제목: ${result.title}`)
console.log('요약:')
result.summary.split('\n').forEach((s, i) =>
  console.log(`  ${i + 1}. (${s.length}자) ${s}`)
)
console.log(`태그: ${JSON.stringify(result.tags)}`)

console.log('\n--- 규칙 확인 ---')
const 문장들 = result.summary.split('\n').filter(Boolean)
console.log(`  문장 수 ${문장들.length} ≤ ${MAX_SUMMARY_SENTENCES}: ${문장들.length <= MAX_SUMMARY_SENTENCES ? '✅' : '❌'}`)
console.log(`  가장 긴 문장 ${Math.max(...문장들.map((s) => s.length))}자 ≤ ${MAX_SENTENCE_CHARS + 1}: ${문장들.every((s) => s.length <= MAX_SENTENCE_CHARS + 1) ? '✅' : '❌'}`)
console.log(`  태그 수 ${result.tags.length} ≤ ${MAX_TAGS}: ${result.tags.length <= MAX_TAGS ? '✅' : '❌'}`)
console.log(`  태그 길이 전부 ${MAX_TAG_CHARS}자 이내: ${result.tags.every((t) => t.length <= MAX_TAG_CHARS) ? '✅' : '❌'}`)
console.log(`  태그에 공백 없음: ${result.tags.every((t) => !/\s/.test(t)) ? '✅' : '❌'}`)
