'use client'

// 검색 줄
// 근거: PRD.md 5번 2), DESIGN.md 2.1과 3.3 검색 흐름
//
// 검색어를 주소(/?q=...)에 담아 서버가 다시 질의하게 한다.
// 브라우저가 이미 받은 20개 안에서 거르지 않으므로 21번째 이후도 찾힌다.
//
// 검색 지우기 버튼과 0건 안내는 PLAN 16번, 태그 필터는 PLAN 15번에서 붙인다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = query.trim()
    // 검색어가 없으면 주소에 q를 붙이지 않아 전체 목록으로 돌아간다.
    router.push(trimmed === '' ? '/' : `/?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form className="searchRow" onSubmit={handleSubmit}>
      <input
        className="searchInput"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="제목, 요약, 태그에서 찾기"
        aria-label="검색어"
      />
      <button className="searchButton" type="submit">
        검색
      </button>
    </form>
  )
}
