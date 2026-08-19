// 유튜브 주소 판별과 공식 창구(YouTube Data API v3) 호출 담당 파일
// 근거: PRD.md 5번 1)(유튜브 규칙), 7번(키 취급), DESIGN.md 3.1의 ⑤
//
// 왜 유튜브만 따로 다루는가
//   배포한 서버가 유튜브 페이지를 직접 읽으면 영상 정보가 빠진 껍데기가 온다.
//   제목은 " - YouTube"가 되고, og:description에는 유튜브 홈 소개문이 담긴다.
//   그대로 요약하면 어느 영상을 저장하든 똑같이 엉뚱한 요약이 남는다.
//   같은 주소가 개인 PC에서는 멀쩡해서 한동안 드러나지 않았다. (2026-08-19 확인)
//
// 여기서 AI를 부르지 않는다. 이 창구는 자료를 가져오는 곳이라
// 링크 1건당 AI 호출 1회 규칙과는 무관하다.

// 이 파일이 실수로 브라우저 쪽 코드에 딸려 들어가면 빌드가 바로 깨지게 한다.
import 'server-only'

/** 영상 번호는 이 글자들로만 이루어진다. 다른 글자가 섞이면 주소로 보지 않는다. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

/** 유튜브 주소로 인정하는 호스트 */
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be',
])

/**
 * 주소에서 영상 번호를 뽑아낸다. 유튜브 영상이 아니면 null.
 *
 * 다루는 형태
 *   https://www.youtube.com/watch?v=ID     (브라우저 주소창)
 *   https://youtu.be/ID?si=...             (앱의 공유 버튼)
 *   https://www.youtube.com/shorts/ID      (쇼츠)
 *   https://www.youtube.com/embed/ID       (퍼가기 주소)
 *   https://www.youtube.com/live/ID        (라이브)
 *
 * 영상 하나를 가리키지 않는 주소(채널, 재생목록, 유튜브 홈)는 null을 준다.
 * 그런 주소는 페이지를 직접 읽는 편이 낫다.
 */
export function parseYouTubeVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  // 경로를 조각으로 나눈다. ['shorts', 'ID'] 같은 모양이 된다.
  const segments = parsed.pathname.split('/').filter(Boolean)

  // youtu.be/ID — 짧은 주소는 경로 첫 조각이 영상 번호다.
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    return isVideoId(segments[0]) ? segments[0] : null
  }

  // youtube.com/watch?v=ID
  if (segments[0] === 'watch') {
    const id = parsed.searchParams.get('v')
    return isVideoId(id) ? id : null
  }

  // youtube.com/shorts/ID, /embed/ID, /live/ID
  if (['shorts', 'embed', 'live'].includes(segments[0] ?? '')) {
    return isVideoId(segments[1]) ? segments[1] : null
  }

  return null
}

function isVideoId(value: string | null | undefined): value is string {
  return typeof value === 'string' && VIDEO_ID_PATTERN.test(value)
}

export type YouTubeVideo = {
  title: string
  /** 영상 설명. 없을 수도 있다. */
  description: string
}

/**
 * 공식 창구에 영상 정보를 물어본다.
 *
 * null을 주는 경우 — 부른 쪽에서 페이지를 직접 읽는 일반 방식으로 되돌아간다.
 *   - 키가 없다 (없어도 앱은 돌아가야 한다)
 *   - 할당량 초과, 키 문제, 연결 실패
 *   - 비공개이거나 지워진 영상이라 결과가 비어 있다
 *
 * signal은 부른 쪽의 15초 제한을 그대로 쓴다. 여기서 따로 시간을 더 주지 않는다.
 */
export async function fetchYouTubeVideo(
  videoId: string,
  signal: AbortSignal
): Promise<YouTubeVideo | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null

  // 영상 번호는 위에서 형태를 검사했지만, 주소에 넣는 값이라 한 번 더 감싼다.
  const endpoint =
    'https://www.googleapis.com/youtube/v3/videos' +
    `?part=snippet&id=${encodeURIComponent(videoId)}`

  try {
    const response = await fetch(endpoint, {
      // 키를 주소에 담지 않는다. 주소는 중간 기록과 서버 로그에 그대로 남는다.
      headers: { 'X-goog-api-key': key },
      signal,
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      items?: { snippet?: { title?: string; description?: string } }[]
    }

    const snippet = body.items?.[0]?.snippet
    if (!snippet) return null

    return {
      title: (snippet.title ?? '').trim(),
      description: (snippet.description ?? '').trim(),
    }
  } catch {
    // 시간 초과, 연결 실패, 응답이 JSON이 아님 등
    return null
  }
}
