'use client'

// 카드 격자 + "더 보기"
// 근거: PRD.md 5번 2)(20개씩, 나머지는 더 보기), DESIGN.md 2.1과 3.2
//
// 첫 20개는 서버가 그려서 넘겨준다. (app/page.tsx)
// "더 보기"를 누르면 GET /api/links로 그다음 20개를 받아 아래에 이어붙인다.
// 브라우저가 Supabase에 직접 붙지 않는다. 서버를 거친다.
//
// 남은 게 없으면 버튼이 사라진다.

import { useState } from 'react'
import LinkCard from '@/components/LinkCard'
// 한 번에 몇 개를 가져올지는 서버가 정한다. 여기서 개수를 다시 세지 않는다.
import { UI_TEXT, type Link } from '@/lib/constants'

export default function LinkList({
  initialLinks,
  initialHasMore,
  query,
  tag,
}: {
  initialLinks: Link[]
  initialHasMore: boolean
  query: string
  tag: string
}) {
  const [links, setLinks] = useState(initialLinks)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    if (loading) return
    setLoading(true)

    try {
      // 지금까지 받은 개수만큼 건너뛰고 그다음 20개를 받는다.
      // 검색어와 태그를 함께 보내야 걸러진 결과 안에서 이어진다.
      const params = new URLSearchParams({ offset: String(links.length) })
      if (query) params.set('q', query)
      if (tag) params.set('tag', tag)

      const response = await fetch(`/api/links?${params.toString()}`)
      if (!response.ok) return

      const body = (await response.json()) as { data: Link[]; hasMore: boolean }
      setLinks((prev) => [...prev, ...body.data])
      setHasMore(body.hasMore)
    } catch {
      // 인터넷이 끊긴 경우 등. 버튼은 그대로 남아 다시 누를 수 있다.
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="grid">
        {links.map((link) => (
          <LinkCard key={link.id} link={link} query={query} />
        ))}
      </div>

      {hasMore && (
        <div className="loadMoreRow">
          <button
            className="loadMoreButton"
            type="button"
            onClick={loadMore}
            disabled={loading}
          >
            {UI_TEXT.loadMore}
          </button>
        </div>
      )}
    </>
  )
}
