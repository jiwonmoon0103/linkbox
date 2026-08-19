// PLAN 9번 확인용 스크립트
// 목록 화면이 DB의 링크를 실제로 그리는지 눈으로 확인하려면 데이터가 있어야 한다.
// 저장 화면은 PLAN 10번이라 아직 없으므로, 여기서 테스트용 줄을 직접 넣고 지운다.
//
// 실행:
//   node --env-file=.env scripts/check-list.mts seed 5   (테스트 링크 5건 넣기)
//   node --env-file=.env scripts/check-list.mts clean     (테스트 링크 전부 지우기)
//
// 테스트 링크는 주소가 https://check-list.example/... 로 시작해서 구분한다.

import { db } from '../lib/db.ts'

const TEST_PREFIX = 'https://check-list.example/'

const command = process.argv[2]
const count = Number(process.argv[3] ?? 5)

if (command === 'seed') {
  const rows = Array.from({ length: count }, (_, i) => ({
    url: `${TEST_PREFIX}${i + 1}`,
    title:
      i % 2 === 0
        ? `테스트 링크 ${i + 1}`
        : `제목이 아주 길어서 두 줄을 넘기는 테스트 링크 ${i + 1}번입니다. 두 줄까지만 보이고 나머지는 잘려야 합니다`,
    summary:
      i % 3 === 0
        ? '요약 실패'
        : `요약 첫 문장입니다. 요약 둘째 문장입니다. 요약 셋째 문장입니다. 넷째 문장은 세 줄을 넘겨 잘려야 합니다. (${i + 1}번)`,
    tags: i % 3 === 0 ? [] : ['ai', 'nextjs', '검색'].slice(0, (i % 3) + 1),
  }))

  const { data, error } = await db.from('links').insert(rows).select('id')
  if (error) {
    console.error('❌ 넣기 실패:', error.message)
    process.exit(1)
  }
  console.log('✅ 테스트 링크', data.length, '건 넣음')
} else if (command === 'clean') {
  const { data, error } = await db
    .from('links')
    .delete()
    .like('url', `${TEST_PREFIX}%`)
    .select('id')

  if (error) {
    console.error('❌ 지우기 실패:', error.message)
    process.exit(1)
  }
  console.log('✅ 테스트 링크', data.length, '건 지움')
} else {
  console.error('seed 또는 clean 중 하나를 적어 주세요.')
  process.exit(1)
}

const { count: total } = await db
  .from('links')
  .select('*', { count: 'exact', head: true })
console.log('   현재 links 테이블:', total, '건')
