import type { Conversation, StreamEvent, Paradigm } from '../types'

const BASE_URL = 'http://127.0.0.1:8000'

export async function createConversation(title: string = 'New Conversation', paradigm: string = 'layered_teaching'): Promise<Conversation> {
  const res = await fetch(`${BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, paradigm }),
  })
  return res.json()
}

export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${BASE_URL}/api/conversations`)
  return res.json()
}

export async function getConversationTree(conversationId: string) {
  const res = await fetch(`${BASE_URL}/api/chat/${conversationId}/tree`)
  return res.json()
}

export async function getMessagePath(conversationId: string, messageId: string) {
  const res = await fetch(`${BASE_URL}/api/chat/${conversationId}/path/${messageId}`)
  return res.json()
}

export async function deleteConversation(conversationId: string) {
  await fetch(`${BASE_URL}/api/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function renameConversation(conversationId: string, title: string) {
  await fetch(`${BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export async function listParadigms(): Promise<Paradigm[]> {
  const res = await fetch(`${BASE_URL}/api/paradigms`)
  return res.json()
}

export async function* streamChat(
  conversationId: string,
  content: string,
  parentId?: string | null,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE_URL}/api/chat/${conversationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parent_id: parentId }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6))
          yield event
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
