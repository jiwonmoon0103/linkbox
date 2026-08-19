// PLAN 13번·19번 확인용 — AI 호출 횟수를 세는 가짜 OpenAI 서버
//
// "링크 1건당 AI 호출은 정확히 1회"는 PRD.md가 못박은 규칙이고 요금과 직결된다.
// 진짜 OpenAI 대신 이 서버를 바라보게 해서 호출 수를 직접 센다. 요금이 들지 않는다.
//
// 쓰는 법
//   1) node scripts/fake-openai.mts        (이 서버를 켠다, 4399 포트)
//   2) .env.local에 OPENAI_BASE_URL=http://127.0.0.1:4399/v1 를 넣고 개발 서버를 다시 켠다
//   3) 링크를 저장해 본 뒤 http://127.0.0.1:4399/count 로 호출 수를 확인한다
//   4) 확인이 끝나면 .env.local을 지우고 개발 서버를 다시 켠다
//
// 주의: 이 서버는 확인용이다. 앱 코드가 이 파일을 부르는 일은 없다.

import http from 'node:http'

const PORT = 4399
let 호출수 = 0

// 진짜 모델 대신 돌려줄 답. lib/ai.ts가 JSON으로 읽을 수 있는 모양이어야 한다.
const 가짜답 = JSON.stringify({
  summary: ['가짜 요약 첫 문장.', '가짜 요약 둘째 문장.'],
  tags: ['가짜태그'],
  titleIsUseful: true,
  title: '',
})

const server = http.createServer((req, res) => {
  if (req.url === '/count') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 호출수 }))
    return
  }

  if (req.url === '/reset') {
    호출수 = 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 호출수 }))
    return
  }

  // 그 밖의 요청은 전부 모델 호출로 센다.
  호출수 += 1
  console.log(`  [가짜 OpenAI] ${req.method} ${req.url} → 지금까지 ${호출수}회`)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(
    JSON.stringify({
      id: 'fake',
      object: 'chat.completion',
      model: 'gpt-4o-mini',
      choices: [
        { index: 0, message: { role: 'assistant', content: 가짜답 }, finish_reason: 'stop' },
      ],
    })
  )
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`가짜 OpenAI 서버가 http://127.0.0.1:${PORT} 에서 호출 수를 셉니다.`)
})
