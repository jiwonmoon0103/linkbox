// 목록 카드 1개
// 근거: PRD.md 5번 2)(카드에 담는 것, 태그 클릭 필터), DESIGN.md 2.1
//
// 목록·검색·태그 필터가 전부 이 컴포넌트 하나만 쓴다. (CLAUDE.md 화면 규칙)
// 카드에 담는 것은 제목, 요약, 태그, 저장일 넷뿐이다. 썸네일은 넣지 않는다.
//
// 클릭 규칙 (PRD.md 5번 2))
//   - 카드를 누르면 원문이 새 탭에서 열린다
//   - 태그와 삭제 버튼은 카드 클릭보다 우선한다. 원문 새 탭은 열리지 않는다
//
// 카드 전체를 <a>로 감싸면 그 안에 태그 링크를 넣을 수 없다. (겹친 링크는 잘못된 구조)
// 그래서 제목의 링크가 카드 전체를 덮게 하고(globals.css의 .cardLink::after),
// 태그와 삭제 버튼은 그 위에 얹는다. 자바스크립트로 클릭을 가로채지 않아도 되고
// 키보드로도 넘어간다.
//
// "정말 삭제할까요?" 확인은 목록(components/LinkList.tsx)이 받는다.
// 카드마다 확인창을 두지 않고 한 개를 돌려 쓴다.

import Link from 'next/link'
import {
  SUMMARY_FULL_VIEW_CHARS,
  UI_TEXT,
  type Link as LinkItem,
} from '@/lib/constants'

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

export default function LinkCard({
  link,
  query = '',
  onDeleteClick,
  onMoreClick,
}: {
  link: LinkItem
  /** 지금 걸려 있는 검색어. 태그를 눌러도 검색어는 유지된다. (두 조건 AND) */
  query?: string
  /** 삭제 버튼을 눌렀을 때. 확인창은 목록이 띄운다. */
  onDeleteClick: (link: LinkItem) => void
  /** 전체 보기 버튼을 눌렀을 때. 창은 목록이 띄운다. */
  onMoreClick: (link: LinkItem) => void
}) {
  // 요약이 길면 카드에서 3줄로 잘린다. 그때만 전체 보기 버튼을 보여준다.
  const 요약이길다 = link.summary.length > SUMMARY_FULL_VIEW_CHARS
  function tagHref(tag: string): string {
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    params.set('tag', tag)
    return `/?${params.toString()}`
  }

  return (
    <article className="card">
      <h2 className="cardTitle">
        {/* 이 링크가 카드 전체를 덮는다. 새 탭이라 지금 보던 검색어와 위치는 그대로 남는다. */}
        <a
          className="cardLink"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {/* 제목이 비어 있으면 주소라도 보이게 한다. */}
          {link.title || link.url}
        </a>
      </h2>

      <p className="cardSummary">{link.summary}</p>

      <div className="cardFooter">
        <div className="cardTags">
          {link.tags.map((tag) => (
            <Link className="cardTag" href={tagHref(tag)} key={tag}>
              #{tag}
            </Link>
          ))}
        </div>
        <div className="cardBottom">
          <p className="cardDate">{formatDate(link.created_at)}</p>
          <div className="cardActions">
            {요약이길다 && (
              <button
                className="cardMore"
                type="button"
                onClick={() => onMoreClick(link)}
                aria-label={`${link.title || link.url} 요약 ${UI_TEXT.viewSummary}`}
              >
                {UI_TEXT.viewSummary}
              </button>
            )}
            <button
              className="cardDelete"
              type="button"
              onClick={() => onDeleteClick(link)}
              aria-label={`${link.title || link.url} 삭제`}
            >
              삭제
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
