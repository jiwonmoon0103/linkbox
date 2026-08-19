// 화면 1개 (저장 줄 + 검색 줄 + 카드 격자)
// 근거: DESIGN.md 2번 화면 구성
//
// 지금은 PLAN 8번(카드 컴포넌트와 격자 레이아웃)까지만 만든 상태다.
// 아래 SAMPLE_LINKS는 격자가 3열 → 2열 → 1열로 줄어드는지, 카드 높이가
// 같은지 눈으로 확인하기 위한 임시 데이터이며 PLAN 9번에서 DB 조회로 바꾼다.
// 저장 줄과 검색 줄은 PLAN 10번, 14번에서 붙인다.

import LinkCard from '@/components/LinkCard'
import type { Link } from '@/lib/constants'

const SAMPLE_LINKS: Link[] = [
  {
    id: 1,
    url: 'https://example.com/a',
    title: '제목이 한 줄인 경우',
    summary: '요약 첫 문장입니다.\n요약 둘째 문장입니다.\n요약 셋째 문장입니다.',
    tags: ['ai', 'nextjs', 'db'],
    created_at: '2026-08-18T09:00:00+09:00',
  },
  {
    id: 2,
    url: 'https://example.com/b',
    title:
      '제목이 아주 길어서 두 줄을 넘기는 경우에는 두 줄까지만 보이고 나머지는 말줄임으로 잘려야 한다',
    summary:
      '요약도 아주 길어서 세 줄을 넘기는 경우에는 세 줄까지만 보이고 나머지는 말줄임으로 잘려야 한다. 카드 높이는 이 경우에도 다른 카드와 똑같이 유지되어야 한다. 그래야 격자가 어긋나지 않는다.',
    tags: ['검색'],
    created_at: '2026-08-17T22:30:00+09:00',
  },
  {
    id: 3,
    url: 'https://example.com/c',
    title: '요약에 실패한 링크',
    summary: '요약 실패',
    tags: [],
    created_at: '2026-08-17T10:00:00+09:00',
  },
  {
    id: 4,
    url: 'https://example.com/d',
    title: '본문이 짧은 페이지',
    summary: '요약 없음(본문이 짧은 페이지)',
    tags: [],
    created_at: '2026-08-16T08:05:00+09:00',
  },
  {
    id: 5,
    url: 'https://example.com/e',
    title: '태그가 세 개인 링크',
    summary: '한 문장짜리 요약도 카드 높이는 그대로다.',
    tags: ['react', 'css', '레이아웃'],
    created_at: '2026-08-15T13:40:00+09:00',
  },
]

export default function Home() {
  return (
    <main className="container">
      <h1 className="siteTitle">linkbox</h1>

      <div className="grid">
        {SAMPLE_LINKS.map((link) => (
          <LinkCard key={link.id} link={link} />
        ))}
      </div>
    </main>
  )
}
