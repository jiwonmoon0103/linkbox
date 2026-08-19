// 저장할 한 줄을 만드는 파일
// 근거: PRD.md 5번 1), DESIGN.md 3.1의 ⑤~⑨, 8번 오류 처리
//
// "언제 AI를 부르고, 못 부를 때 무엇을 저장하는가"를 여기 한 곳에 모은다.
// 링크 1건당 AI 호출은 아래 마지막 갈래에서 딱 1회뿐이다.
//
// 세 갈래로 끝난다. 어느 갈래를 타든 AI 호출은 1회를 넘지 않는다.
//   - 페이지를 읽지 못함 (404, 15초 초과 등) → "요약 실패", AI 부르지 않음
//   - 본문이 200자 미만 (PDF, 쇼핑몰 등)     → "요약 없음". 제목이 있으면
//                                              제목만으로 태그 1회 (요약은 요청 안 함)
//   - 그 밖                                  → 요약·태그·제목을 1회에 함께 받음
//
// 어느 갈래든 URL과 제목은 반드시 남는다. 요약을 지어내지 않는다.

// 이 파일이 실수로 브라우저 쪽 코드에 딸려 들어가면 빌드가 바로 깨지게 한다.
import 'server-only'

import { fetchPage } from './fetchPage.ts'
import { summarize, tagsFromTitle } from './ai.ts'
import { titleFromUrl } from './url.ts'
import {
  MAX_TITLE_CHARS,
  SUMMARY_FAILED,
  SUMMARY_NONE,
  type NewLink,
} from './constants.ts'

/**
 * 저장되는 제목은 모두 이곳을 지난다.
 * 페이지에서 뽑은 것, AI가 지은 것, 주소에서 만든 것 셋 다 남이 좌우할 수 있어
 * 마지막에 한 번 더 자른다. (요약과 태그를 lib/ai.ts에서 자르는 것과 같은 이유)
 */
function trimTitle(title: string): string {
  return title.slice(0, MAX_TITLE_CHARS)
}

export async function buildLink(url: string): Promise<NewLink> {
  const page = await fetchPage(url)

  // 읽지 못한 경우. 제목이 없으니 주소의 호스트와 경로를 제목으로 쓴다.
  if (!page.ok) {
    return {
      url,
      title: trimTitle(titleFromUrl(url)),
      summary: SUMMARY_FAILED,
      tags: [],
    }
  }

  // PDF, 이미지 위주 페이지, 자바스크립트로 그리는 쇼핑몰처럼
  // 뽑아낼 본문이 거의 없는 경우. 껍데기 글자로 요약을 지어내지 않는다.
  //
  // 다만 제목이 있으면 그것만으로 태그는 받는다. (PRD.md 5번 1))
  // 태그가 없으면 이런 링크는 태그 필터에 영영 걸리지 않아 쌓이기만 한다.
  // 요약은 요청하지 않으므로 지어낸 문장이 들어올 여지가 없다.
  if (page.tooShort) {
    let tags: string[] = []

    // 제목이 없으면(PDF 등) 태그를 뽑을 근거가 없으니 AI를 부르지 않는다.
    if (page.title) {
      try {
        // 이 갈래에서 AI 호출은 여기 1회뿐이다. 아래 요약 갈래와는 배타적이다.
        tags = await tagsFromTitle(page.title)
      } catch {
        // 태그를 못 받아도 저장은 한다. 다시 부르지 않는다.
        tags = []
      }
    }

    return {
      url,
      title: trimTitle(page.title || titleFromUrl(url)),
      summary: SUMMARY_NONE,
      tags,
    }
  }

  try {
    // 여기가 링크 1건당 유일한 AI 호출이다.
    const ai = await summarize(page.title, page.text)
    return {
      url,
      title: trimTitle(ai.title || titleFromUrl(url)),
      summary: ai.summary || SUMMARY_FAILED,
      tags: ai.tags,
    }
  } catch {
    // AI 호출이 실패해도 URL과 제목은 저장한다. 다시 부르지 않는다.
    return {
      url,
      title: trimTitle(page.title || titleFromUrl(url)),
      summary: SUMMARY_FAILED,
      tags: [],
    }
  }
}
