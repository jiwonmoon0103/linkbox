// Supabase 연결 담당 파일
// 근거: DESIGN.md 5번 파일 구조(lib/db.ts), PRD.md 9번 접근 경로
//
// 이 파일은 서버에서만 불러야 한다.
// service_role 키는 모든 권한을 가지므로 브라우저로 나가면 안 된다.
// (그래서 환경변수 이름에 NEXT_PUBLIC_ 접두사를 붙이지 않는다)

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  // 키가 없으면 조용히 실패하지 않고 바로 알린다.
  throw new Error(
    '.env에 SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.'
  )
}

export const db = createClient(url, serviceRoleKey, {
  auth: {
    // 서버에서만 쓰는 연결이라 로그인 세션을 저장하거나 갱신할 필요가 없다.
    persistSession: false,
    autoRefreshToken: false,
  },
})
