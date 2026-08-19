'use client'

// 저장 줄 (주소 입력칸, 비밀번호 칸, 저장 버튼)
// 근거: PRD.md 5번 1), DESIGN.md 2.1과 3.1 저장 흐름
//
// 입력값과 "저장 중..." 상태를 브라우저에서 다뤄야 해서 클라이언트 컴포넌트다.
// 비밀 키를 쓰는 일(DB 접근, 비밀번호 대조)은 전부 서버가 하고,
// 여기서는 POST /api/links를 부르고 결과 문구만 보여준다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ERROR_MESSAGES, UI_TEXT } from '@/lib/constants'

export default function SaveForm({ hasSession }: { hasSession: boolean }) {
  const router = useRouter()

  const [url, setUrl] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  // 입력창이 비어 있거나 저장 중이면 버튼이 눌리지 않는다.
  const disabled = url.trim() === '' || saving

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (disabled) return

    setSaving(true)
    setMessage('')

    try {
      const response = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, password: password || undefined }),
      })
      const body = await response.json()

      if (response.ok) {
        // 저장에 성공했으면 입력칸을 비우고 목록을 새로 그린다.
        // 서버 컴포넌트가 DB를 다시 읽으므로 새 카드가 맨 앞에 나타나고,
        // 비밀번호로 통과했다면 쿠키가 생겨 비밀번호 칸도 사라진다.
        setUrl('')
        setPassword('')
        router.refresh()
        return
      }

      // 실패 문구는 서버가 내려준 것을 그대로 쓴다. (문구 원본은 lib/constants.ts)
      setMessage(body?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR)
    } catch {
      // 인터넷이 끊긴 경우 등. 버튼은 아래 finally에서 원래대로 돌아온다.
      setMessage(ERROR_MESSAGES.SERVER_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="saveRow" onSubmit={handleSubmit}>
      <input
        className="saveUrl"
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        disabled={saving}
        aria-label="저장할 주소"
      />

      {/* 1시간 안에 비밀번호를 통과했으면 이 칸은 아예 보이지 않는다. */}
      {!hasSession && (
        <input
          className="savePassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          disabled={saving}
          aria-label="비밀번호"
        />
      )}

      <button className="saveButton" type="submit" disabled={disabled}>
        {saving ? UI_TEXT.saving : '저장'}
      </button>

      {/* 안내 문구 자리 — "이미 저장된 링크입니다" 등이 여기 뜬다. */}
      {message && (
        <p className="saveMessage" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
