'use client'

// 화면을 그리다 실패했을 때 보여주는 안내
// 근거: DESIGN.md 8번 오류 처리
//
// 첫 화면은 서버가 DB를 읽어 그린다. DB가 응답하지 않으면 그 읽기가 실패하는데,
// 이 파일이 없으면 Next.js 기본 오류 화면이 그대로 뜬다.
// 사용자가 무엇을 해야 할지 알 수 있게 문구와 다시 시도 버튼을 둔다.
//
// 오류의 자세한 내용은 보여주지 않는다. 서버 사정이 밖으로 새면 안 되고,
// 사용자가 할 수 있는 일은 다시 시도하는 것뿐이다.

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="container">
      <h1 className="siteTitle">linkbox</h1>
      <div className="empty">
        <p className="emptyText">
          목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button className="clearSearch" type="button" onClick={reset}>
          다시 시도
        </button>
      </div>
    </main>
  )
}
