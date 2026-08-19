// Supabase 연결 담당 파일
// 근거: DESIGN.md 5번 파일 구조(lib/db.ts), PRD.md 9번 접근 경로
//
// 이 파일은 서버에서만 불러야 한다.
// service_role 키는 모든 권한을 가지므로 브라우저로 나가면 안 된다.
// (그래서 환경변수 이름에 NEXT_PUBLIC_ 접두사를 붙이지 않는다)

import { createClient } from '@supabase/supabase-js'
// lib 안에서는 상대 경로로 가져온다. scripts/의 확인용 스크립트를 node로 직접
// 실행할 때 '@/' 별칭을 해석하지 못하기 때문이다.
import { PAGE_SIZE, type Link } from './constants.ts'

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

/**
 * 링크 목록을 최신순으로 PAGE_SIZE(20)개씩 읽는다.
 * 첫 화면(서버 컴포넌트)과 "더 보기"(GET /api/links)가 같은 함수를 쓴다.
 * 두 곳에 같은 질의를 따로 적으면 정렬이나 개수가 어긋나기 때문이다.
 *
 * @param offset 건너뛸 개수. "더 보기"를 누를 때마다 20씩 늘려 보낸다.
 */
export async function fetchLinks(
  offset = 0
): Promise<{ links: Link[]; hasMore: boolean }> {
  // 한 개를 더 불러와서, 다음 쪽이 남았는지 판단한다.
  const { data, error } = await db
    .from('links')
    .select('*')
    .order('created_at', { ascending: false })
    // 같은 순간에 저장된 링크는 created_at이 같아 순서가 흔들린다.
    // id로 한 번 더 정렬해야 "더 보기"에서 빠지거나 겹치는 링크가 없다.
    .order('id', { ascending: false })
    .range(offset, offset + PAGE_SIZE)

  if (error || !data) {
    throw new Error('links 테이블을 읽지 못했습니다.')
  }

  const hasMore = data.length > PAGE_SIZE
  return {
    links: (hasMore ? data.slice(0, PAGE_SIZE) : data) as Link[],
    hasMore,
  }
}
