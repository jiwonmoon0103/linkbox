// PLAN 3번 확인용 스크립트
// 서버 쪽 코드(lib/db.ts)로 실제 테이블 조회가 되는지 눈으로 확인한다.
// 실행: node --env-file=.env scripts/check-db.mts

import { db } from '../lib/db.ts'

const { count, error } = await db
  .from('links')
  .select('*', { count: 'exact', head: true })

if (error) {
  console.error('❌ 조회 실패:', error.message)
  process.exit(1)
}

console.log('✅ links 테이블 조회 성공 — 현재', count, '건')

// 검색 함수도 서버에서 부를 수 있는지 함께 확인한다.
const { error: fnError } = await db.rpc('search_links', {
  p_q: '테스트',
  p_tag: null,
  p_limit: 20,
  p_offset: 0,
})

if (fnError) {
  console.error('❌ search_links 호출 실패:', fnError.message)
  process.exit(1)
}

console.log('✅ search_links 함수 호출 성공')
