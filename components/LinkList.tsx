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
import { ERROR_MESSAGES, UI_TEXT, type Link } from '@/lib/constants'

export default function LinkList({
  initialLinks,
  initialHasMore,
  query,
  tag,
  hasSession,
}: {
  initialLinks: Link[]
  initialHasMore: boolean
  query: string
  tag: string
  /** 1시간 안에 비밀번호를 통과했는지. 확인창에서 비밀번호를 받을지 정한다. */
  hasSession: boolean
}) {
  const [links, setLinks] = useState(initialLinks)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)
  // "더 보기"가 실패했을 때 보여줄 문구. 조용히 넘어가면 사용자가 이유를 모른다.
  const [loadError, setLoadError] = useState('')

  // 서버가 목록을 다시 그려 보내면 그것으로 맞춘다.
  // 링크를 저장한 뒤 SaveForm이 화면을 새로 그리게 하는데(router.refresh),
  // 이 맞춤이 없으면 브라우저가 들고 있던 옛 목록이 그대로 남아
  // 새로 저장한 카드가 맨 앞에 나타나지 않는다. (DESIGN.md 3.1)
  //
  // 서버가 다시 그릴 때만 새 배열이 오므로, 브라우저 안에서 상태만 바뀔 때는
  // 여기가 동작하지 않는다. ("더 보기"로 이어붙인 것이 헛되이 지워지지 않는다)
  const [syncedFrom, setSyncedFrom] = useState(initialLinks)
  if (syncedFrom !== initialLinks) {
    setSyncedFrom(initialLinks)
    setLinks(initialLinks)
    setHasMore(initialHasMore)
  }

  // 삭제 확인창 상태. pending이 있으면 확인창이 열려 있다.
  const [pending, setPending] = useState<Link | null>(null)
  const [password, setPassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // 이번 화면에서 비밀번호를 통과했는지. 서버가 쿠키를 내려주면 다시 묻지 않는다.
  const [passed, setPassed] = useState(hasSession)

  // 요약 전체 보기 창. viewing이 있으면 열려 있다.
  // 카드 높이를 모두 같게 고정한다는 규칙(CLAUDE.md) 때문에 카드 안에서 펼치지 않고
  // 삭제 확인창과 같은 방식으로 띄운다. 격자가 흐트러지지 않는다.
  const [viewing, setViewing] = useState<Link | null>(null)

  function askDelete(link: Link) {
    setPending(link)
    setPassword('')
    setDeleteError('')
  }

  function closeDialog() {
    setPending(null)
    setPassword('')
    setDeleteError('')
  }

  async function confirmDelete() {
    if (!pending || deleting) return
    setDeleting(true)
    setDeleteError('')

    try {
      const response = await fetch(`/api/links/${pending.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || undefined }),
      })

      if (response.ok) {
        // 지운 카드를 목록에서 뺀다.
        setLinks((prev) => {
          const 남은목록 = prev.filter((l) => l.id !== pending.id)
          // 마지막 한 장을 지웠는데 버튼이 남아 있으면 눌러도 0건이 온다.
          if (남은목록.length === 0) setHasMore(false)
          return 남은목록
        })
        setPassed(true) // 통과했으니 다음 삭제부터는 묻지 않는다
        closeDialog()
        return
      }

      const body = await response.json()
      setDeleteError(body?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR)
    } catch {
      setDeleteError(ERROR_MESSAGES.SERVER_ERROR)
    } finally {
      setDeleting(false)
    }
  }

  async function loadMore() {
    if (loading) return
    setLoading(true)
    setLoadError('')

    try {
      // 지금까지 받은 개수만큼 건너뛰고 그다음 20개를 받는다.
      // 검색어와 태그를 함께 보내야 걸러진 결과 안에서 이어진다.
      const params = new URLSearchParams({ offset: String(links.length) })
      if (query) params.set('q', query)
      if (tag) params.set('tag', tag)

      const response = await fetch(`/api/links?${params.toString()}`)
      if (!response.ok) {
        setLoadError(ERROR_MESSAGES.SERVER_ERROR)
        return
      }

      const body = (await response.json()) as { data: Link[]; hasMore: boolean }
      setLinks((prev) => [...prev, ...body.data])
      setHasMore(body.hasMore)
    } catch {
      // 인터넷이 끊긴 경우 등. 버튼은 그대로 남아 다시 누를 수 있다.
      setLoadError(ERROR_MESSAGES.SERVER_ERROR)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="grid">
        {links.map((link) => (
          <LinkCard
            key={link.id}
            link={link}
            query={query}
            onDeleteClick={askDelete}
            onMoreClick={setViewing}
          />
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
          {loadError && (
            <p className="loadMoreError" role="alert">
              {loadError}
            </p>
          )}
        </div>
      )}

      {/* 요약 전체 보기 창. 카드에서 3줄로 잘린 요약을 전부 보여준다. */}
      {viewing && (
        <div className="dialogBack" onClick={() => setViewing(null)}>
          {/* 창 안을 눌렀을 때는 닫히지 않게 한다. 바깥을 눌러야 닫힌다. */}
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={UI_TEXT.summaryTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="dialogText">{viewing.title || viewing.url}</p>
            {/* 문장 사이 줄바꿈을 살려서 보여준다. 저장할 때 \n으로 이어붙였다. */}
            <p className="dialogSummary">{viewing.summary}</p>

            <div className="dialogButtons">
              <button
                className="dialogCancel"
                type="button"
                onClick={() => setViewing(null)}
                autoFocus
              >
                {UI_TEXT.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인창. 지우기 직전에 한 번 묻는다. (PRD.md 5번 1)) */}
      {pending && (
        <div className="dialogBack">
          <div className="dialog" role="dialog" aria-modal="true">
            <p className="dialogText">{UI_TEXT.deleteConfirm}</p>
            <p className="dialogTarget">{pending.title || pending.url}</p>

            {/* 아직 통과하지 않았으면 여기서 비밀번호도 함께 받는다. */}
            {!passed && (
              <input
                className="dialogPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                aria-label="비밀번호"
                disabled={deleting}
                autoFocus
              />
            )}

            {deleteError && (
              <p className="dialogError" role="alert">
                {deleteError}
              </p>
            )}

            <div className="dialogButtons">
              <button
                className="dialogCancel"
                type="button"
                onClick={closeDialog}
                disabled={deleting}
              >
                취소
              </button>
              <button
                className="dialogDelete"
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
