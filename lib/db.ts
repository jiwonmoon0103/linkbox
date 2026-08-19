// Supabase 연결 담당 파일
// 근거: DESIGN.md 5번 파일 구조(lib/db.ts), PRD.md 9번 접근 경로
//
// 이 파일은 서버에서만 불러야 한다.
// service_role 키는 모든 권한을 가지므로 브라우저로 나가면 안 된다.
// (그래서 환경변수 이름에 NEXT_PUBLIC_ 접두사를 붙이지 않는다)

// 이 파일이 실수로 브라우저 쪽 코드에 딸려 들어가면 빌드가 바로 깨지게 한다.
import 'server-only'

import { createClient } from '@supabase/supabase-js'
// lib 안에서는 상대 경로로 가져온다. scripts/의 확인용 스크립트를 node로 직접
// 실행할 때 '@/' 별칭을 해석하지 못하기 때문이다.
import {
  MAX_OFFSET,
  MAX_QUERY_CHARS,
  PAGE_SIZE,
  type Link,
} from './constants.ts'

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

export type LinkQuery = {
  /** 건너뛸 개수. "더 보기"를 누를 때마다 20씩 늘려 보낸다. */
  offset?: number
  /** 검색어. 제목·요약·태그 세 곳을 함께 뒤진다. */
  q?: string
  /** 태그 필터. 정확히 일치하는 태그만 남긴다. */
  tag?: string
}

/**
 * 링크를 최신순으로 PAGE_SIZE(20)개씩 읽는다.
 * 목록, 검색, 태그 필터가 전부 이 함수 하나를 쓴다.
 *
 * 검색과 필터는 DB의 search_links 함수가 처리한다.
 *   - tags가 배열이라 ILIKE를 직접 걸 수 없어 DB 함수로 처리한다
 *   - 이미 불러온 20개 안에서 거르지 않으므로 21번째 이후도 찾힌다
 *   - 검색어와 태그가 함께 오면 두 조건을 모두 만족하는 것만 남긴다(AND)
 *
 * AI는 부르지 않는다. 검색은 DB 텍스트 검색만 쓴다. (PRD.md 5번 2))
 */
/**
 * 검색어를 DB에 넘기기 전에 다듬는다.
 *
 * 두 가지를 한다.
 *   1) 길이를 자른다 — 목록 조회는 누구나 부를 수 있어 상한이 필요하다
 *   2) %와 _를 글자 그대로 찾도록 표시한다
 *      DB가 쓰는 ILIKE에서 %는 "아무 글자나", _는 "한 글자"를 뜻한다.
 *      그대로 두면 "%"로 검색했을 때 전부 나오고, "할인 50%"를 찾을 수 없다.
 *      앞에 \를 붙이면 글자 그대로 찾는다. (\ 자신도 붙여줘야 한다)
 */
function sanitizeQuery(q: string): string {
  return q.trim().slice(0, MAX_QUERY_CHARS).replace(/[\\%_]/g, '\\$&')
}

export async function fetchLinks({
  offset = 0,
  q = '',
  tag = '',
}: LinkQuery = {}): Promise<{ links: Link[]; hasMore: boolean }> {
  // 태그는 정확히 같은 것만 찾으므로(= any) 와일드카드 표시가 필요 없다.
  // 길이만 자른다.
  const safeTag = tag.trim().slice(0, MAX_QUERY_CHARS)
  const safeOffset = Math.min(Math.max(0, Math.floor(offset) || 0), MAX_OFFSET)

  // 한 개를 더 불러와서, 다음 쪽이 남았는지 판단한다.
  const { data, error } = await db.rpc('search_links', {
    p_q: sanitizeQuery(q),
    p_tag: safeTag,
    p_limit: PAGE_SIZE + 1,
    p_offset: safeOffset,
  })

  if (error || !data) {
    throw new Error('links 테이블을 읽지 못했습니다.')
  }

  const rows = data as Link[]
  const hasMore = rows.length > PAGE_SIZE
  return {
    links: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
    hasMore,
  }
}
