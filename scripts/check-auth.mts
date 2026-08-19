// PLAN 5번 확인용 스크립트
// 비밀번호 확인, 서명 쿠키, 5회 실패 차단이 실제로 도는지 눈으로 확인한다.
// 실행: node --env-file=.env scripts/check-auth.mts
//
// 테스트 IP는 문서용으로 예약된 주소(203.0.113.x)를 쓰고, 끝나면 기록을 지운다.

import {
  authorize,
  clearFailures,
  createSessionToken,
  hashIp,
  verifyPassword,
  verifySessionToken,
} from '../lib/auth.ts'
import { db } from '../lib/db.ts'
import { SESSION_TTL_MS } from '../lib/constants.ts'

const TEST_IP = '203.0.113.99'
const RIGHT = process.env.ADMIN_PASSWORD!
const WRONG = '0000'

let failed = 0
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✅' : '❌'} ${label} → ${JSON.stringify(actual)}`)
}

await clearFailures(TEST_IP)
const now = Date.now()

console.log('--- 1. 비밀번호 대조 ---')
check('맞는 비밀번호', verifyPassword(RIGHT), true)
check('틀린 비밀번호', verifyPassword(WRONG), false)
check('빈 값', verifyPassword(''), false)

console.log('\n--- 2. 서명 쿠키 ---')
const token = createSessionToken(now)
check('방금 만든 쿠키는 유효', verifySessionToken(token, now), true)
check('1시간 뒤에는 만료', verifySessionToken(token, now + SESSION_TTL_MS + 1), false)
check('서명을 고치면 무효', verifySessionToken(token.split('.')[0] + '.가짜서명', now), false)
check('만료시각만 늘리면 무효', verifySessionToken(String(now + 999_999_999) + '.' + token.split('.')[1], now), false)
check('쿠키 없음', verifySessionToken(null, now), false)

console.log('\n--- 3. 통과 판정 ---')
check('맞는 비밀번호 → 통과 + 쿠키 발급', await authorize({ ip: TEST_IP, password: RIGHT, now }), { ok: true, issueCookie: true })
check('유효한 쿠키 → 통과 (비밀번호 없이)', await authorize({ ip: TEST_IP, token, now }), { ok: true, issueCookie: false })

console.log('\n--- 4. 5회 실패 시 10분 차단 ---')
await clearFailures(TEST_IP)
for (let i = 1; i <= 4; i++) {
  const r = await authorize({ ip: TEST_IP, password: WRONG, now })
  check(`${i}회 실패`, r, { ok: false, code: 'WRONG_PASSWORD' })
}
check('5회째 → 차단', await authorize({ ip: TEST_IP, password: WRONG, now }), { ok: false, code: 'BLOCKED' })
check('차단 중에는 맞는 비밀번호도 거절', await authorize({ ip: TEST_IP, password: RIGHT, now }), { ok: false, code: 'BLOCKED' })
check('차단 중에는 유효한 쿠키도 거절', await authorize({ ip: TEST_IP, token, now }), { ok: false, code: 'BLOCKED' })
// 차단 해제 시각은 DB가 정한다. (record_failure 함수)
// 스크립트가 시작한 시각에 10분을 더해 짐작하면, 그 사이에 흐른 시간만큼
// 실제 해제 시각보다 이르게 잡혀 아직 차단 중으로 나온다.
// 그래서 저장된 값을 읽어 그 직후를 쓴다.
const { data: 기록 } = await db
  .from('login_attempts')
  .select('blocked_until')
  .eq('ip_hash', hashIp(TEST_IP))
  .maybeSingle()
const 해제직후 = new Date(기록!.blocked_until).getTime() + 1
check('차단이 풀린 뒤에는 다시 통과', await authorize({ ip: TEST_IP, password: RIGHT, now: 해제직후 }), { ok: true, issueCookie: true })

await clearFailures(TEST_IP)
console.log(`\n테스트 기록 정리 완료. ${failed === 0 ? '전부 통과 ✅' : `실패 ${failed}건 ❌`}`)
process.exit(failed === 0 ? 0 : 1)
