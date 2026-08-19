// 요약·태그 생성 담당 파일
// 근거: PRD.md 5번 1)(AI가 지켜야 할 규칙), DESIGN.md 3.1의 ⑧~⑨
//
// 이 파일은 서버에서만 쓴다. OPENAI_API_KEY는 브라우저로 나가면 안 된다.
//
// 반드시 지킬 것
//   - AI 호출은 링크 1건당 딱 1회다. 제목까지 이 한 번에 함께 받는다.
//   - 모델이 규칙을 어겨도 저장되는 값은 규칙을 지킨다. 아래 정리 함수가
//     문장 수, 글자 수, 태그 수를 코드로 강제한다. 다시 생성하지 않는다.

import OpenAI from 'openai'
import {
  AI_MODEL,
  ELLIPSIS,
  MAX_SENTENCE_CHARS,
  MAX_SUMMARY_SENTENCES,
  MAX_TAGS,
  MAX_TAG_CHARS,
} from './constants.ts'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('.env에 OPENAI_API_KEY가 없습니다.')
    client = new OpenAI({ apiKey })
  }
  return client
}

export type AiResult = {
  /** 페이지 제목이 쓸 만하면 그대로, 아니면 AI가 지은 제목 */
  title: string
  /** 문장 사이를 줄바꿈으로 이어붙인 3문장 이내의 요약 */
  summary: string
  /** 최대 3개 */
  tags: string[]
}

// ---------------------------------------------------------------
// 1. 모델이 뭘 주든 규칙에 맞게 자르는 부분
//    (모델을 믿지 않는다. 저장되는 값은 여기를 반드시 지난다)
// ---------------------------------------------------------------

/** 3문장까지만 남기고, 60자를 넘긴 문장은 60자에서 자른 뒤 말줄임을 붙인다. */
export function trimSummary(sentences: unknown): string {
  const list = Array.isArray(sentences) ? sentences : []

  return list
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SUMMARY_SENTENCES)
    .map((s) =>
      s.length > MAX_SENTENCE_CHARS
        ? s.slice(0, MAX_SENTENCE_CHARS) + ELLIPSIS
        : s
    )
    .join('\n')
}

/** 태그를 3개까지, 공백 없이 10자 이내로, 영어는 소문자로 맞춘다. */
export function trimTags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : []
  const cleaned: string[] = []

  for (const raw of list) {
    if (typeof raw !== 'string') continue

    // 공백은 넣지 않는다. 앞에 붙은 #도 떼어낸다.
    const tag = raw
      .replace(/\s+/g, '')
      .replace(/^#+/, '')
      .toLowerCase()
      .slice(0, MAX_TAG_CHARS)

    if (tag === '') continue
    if (cleaned.includes(tag)) continue // 같은 태그가 두 번 오면 하나만 남긴다

    cleaned.push(tag)
    if (cleaned.length === MAX_TAGS) break
  }

  return cleaned
}

// ---------------------------------------------------------------
// 2. AI 호출 (링크 1건당 여기 1회뿐)
// ---------------------------------------------------------------

// 숫자를 글로 적지 않고 상수에서 끌어온다.
// 규칙이 바뀌면 lib/constants.ts만 고쳐도 지시문이 따라온다.
const SYSTEM_PROMPT = `너는 웹페이지를 정리해주는 도우미다. 아래 규칙을 반드시 지켜 JSON만 답한다.

- summary: 한국어 문장 ${MAX_SUMMARY_SENTENCES}개 이하의 배열. 각 문장은 ${MAX_SENTENCE_CHARS}자를 넘기지 않는다. 페이지 내용만 근거로 쓰고 지어내지 않는다.
- tags: 내용을 대표하는 태그 ${MAX_TAGS}개 이하의 배열. 각 태그는 ${MAX_TAG_CHARS}자를 절대 넘기지 않는다. ${MAX_TAG_CHARS}자가 넘으면 뒤가 잘려 뜻이 사라지므로 짧은 한국어 낱말을 우선 쓴다. 공백을 넣지 않고, 영어는 소문자로 쓴다.
  좋은 예: ["머신러닝", "ai", "통계"]  나쁜 예: ["machinelearning", "artificialintelligence"]
- titleIsUseful: 주어진 제목이 페이지 내용을 알 수 있게 해주면 true, 비어 있거나 "홈"처럼 내용을 알 수 없으면 false.
- title: titleIsUseful이 false일 때만 내용을 근거로 짧은 제목을 짓는다. true면 빈 문자열로 둔다.

답은 {"summary": [], "tags": [], "titleIsUseful": true, "title": ""} 모양의 JSON 하나여야 한다.`

/**
 * 본문을 넘겨 요약·태그·제목을 한 번에 받는다.
 *
 * @param pageTitle 페이지에서 뽑은 title (없으면 빈 문자열)
 * @param body      본문. 이미 5,000자로 잘려 있어야 한다. (lib/fetchPage.ts)
 * @throws 호출에 실패하면 예외를 던진다. 부른 쪽에서 "요약 실패"로 저장한다.
 */
export async function summarize(
  pageTitle: string,
  body: string
): Promise<AiResult> {
  const response = await getClient().chat.completions.create({
    model: AI_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `제목: ${pageTitle || '(없음)'}\n\n본문:\n${body}`,
      },
    ],
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('AI가 답을 주지 않았습니다.')

  const parsed = JSON.parse(raw) as {
    summary?: unknown
    tags?: unknown
    titleIsUseful?: unknown
    title?: unknown
  }

  // 제목은 페이지의 title을 그대로 쓰는 것이 원칙이다.
  // 비어 있거나 내용을 알 수 없을 때만 AI가 지은 것을 쓴다.
  const aiTitle = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  const useAiTitle = pageTitle === '' || parsed.titleIsUseful === false
  const title = useAiTitle && aiTitle !== '' ? aiTitle : pageTitle

  return {
    title,
    summary: trimSummary(parsed.summary),
    tags: trimTags(parsed.tags),
  }
}
