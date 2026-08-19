// 화면 1개 (저장 줄 + 검색 줄 + 카드 격자)
// 근거: DESIGN.md 2번 화면 구성, 3.2 목록 보기
//
// 첫 화면은 서버 컴포넌트가 lib/db.ts로 DB를 직접 읽어 최신순 20개를 그린다.
// 브라우저가 Supabase에 직접 붙지 않으므로 서버 전용 키가 밖으로 나가지 않는다.
// "더 보기"(PLAN 17번)부터는 GET /api/links로 그다음 20개를 가져온다.
//
// 검색어는 주소(/?q=...)에 담긴다. 서버가 그 값으로 DB에 질의하므로
// 이미 불러온 20개 안에서 거르지 않는다. 21번째 이후에 저장한 링크도 찾힌다.

import { cookies } from 'next/headers'
import LinkCard from '@/components/LinkCard'
import SaveForm from '@/components/SaveForm'
import SearchBar from '@/components/SearchBar'
import { fetchLinks } from '@/lib/db'
import { verifySessionToken } from '@/lib/auth'
import { SESSION_COOKIE_NAME, UI_TEXT } from '@/lib/constants'

// 링크를 저장하면 바로 목록에 보여야 하므로 요청마다 새로 그린다.
// 이 줄이 없으면 배포한 뒤 목록이 빌드 시점 상태로 굳는다.
// (next.config.ts에서 cacheComponents를 켜지 않았으므로 이 설정이 유효하다)
export const dynamic = 'force-dynamic'

export default async function Home({ searchParams }: PageProps<'/'>) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : ''

  // hasMore는 "더 보기" 버튼(PLAN 17번)에서 쓴다.
  const { links } = await fetchLinks({ q })

  // 쿠키는 HttpOnly라 브라우저 스크립트가 읽지 못한다.
  // 그래서 서버가 확인해 비밀번호 칸을 보여줄지 말지만 알려준다.
  // 저장 API는 이 값과 무관하게 비밀번호나 쿠키를 다시 직접 확인한다.
  const cookieStore = await cookies()
  const hasSession = verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value
  )

  return (
    <main className="container">
      <h1 className="siteTitle">linkbox</h1>

      <SaveForm hasSession={hasSession} />
      <SearchBar initialQuery={q} />

      {links.length === 0 ? (
        // 저장된 링크가 0개일 때. 검색 결과 0건(PLAN 16번)과는 다른 문구다.
        <div className="empty">
          {/* 링크가 0개일 때만 보여주는 일러스트 1장 (prd_lite.md 5번) */}
          <svg
            className="emptyIllust"
            width="128"
            height="112"
            viewBox="0 0 128 112"
            aria-hidden="true"
          >
            {/* 북마크 */}
            <path d="M54 8h20v30l-10-8-10 8V8Z" />
            {/* 상자 뚜껑 */}
            <rect x="16" y="52" width="96" height="18" rx="2" />
            {/* 상자 몸통 */}
            <path d="M24 70v30a2 2 0 0 0 2 2h76a2 2 0 0 0 2-2V70" />
            {/* 앞면 손잡이 */}
            <path d="M54 70h20" />
          </svg>
          <p className="emptyText">{UI_TEXT.emptyList}</p>
        </div>
      ) : (
        <div className="grid">
          {links.map((link) => (
            <LinkCard key={link.id} link={link} />
          ))}
        </div>
      )}
    </main>
  )
}
