// 목록 카드 1개
// 근거: PRD.md 5번 2)(카드에 담는 것), DESIGN.md 2.1, prd_lite.md 3-2)
//
// 목록·검색·태그 필터가 전부 이 컴포넌트 하나만 쓴다. (CLAUDE.md 화면 규칙)
// 카드에 담는 것은 제목, 요약, 태그, 저장일 넷뿐이다. 썸네일은 넣지 않는다.
//
// 태그 클릭 필터는 PLAN 15번, 삭제 버튼은 PLAN 18번에서 붙인다.

import type { Link } from '@/lib/constants'

/**
 * 저장 시각을 한국 시간(Asia/Seoul) 기준 `2026-08-18` 형태로 만든다.
 * "3일 전" 같은 상대 표기는 쓰지 않는다. (PRD.md 5번 2))
 */
function formatDate(isoString: string): string {
  // en-CA 형식이 곧 YYYY-MM-DD라 따로 이어붙이지 않아도 된다.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString))
}

export default function LinkCard({ link }: { link: Link }) {
  return (
    // 카드를 누르면 원문이 새 탭에서 열린다.
    // 새 탭이라 지금 보던 검색어와 스크롤 위치는 그대로 남는다.
    <a
      className="card"
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {/* 제목이 비어 있으면 주소라도 보이게 한다. */}
      <h2 className="cardTitle">{link.title || link.url}</h2>

      <p className="cardSummary">{link.summary}</p>

      <div className="cardFooter">
        <div className="cardTags">
          {link.tags.map((tag) => (
            <span className="cardTag" key={tag}>
              #{tag}
            </span>
          ))}
        </div>
        <p className="cardDate">{formatDate(link.created_at)}</p>
      </div>
    </a>
  )
}
