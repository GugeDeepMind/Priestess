export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agent_name?: string
  content_type: string
  created_at?: string
  children?: Message[]
}

export interface Conversation {
  id: string
  title: string
  paradigm: string
  created_at?: string
}

export interface StreamEvent {
  type: 'text' | 'call_start' | 'call_result' | 'async_started' | 'error' | 'done'
  | 'image' | 'ui' | 'code'
  content?: string
  agent_name?: string
  call_type?: string
  instruction?: string
  message_id?: string
  user_message_id?: string
  data?: string
  format?: string
  caption?: string
  component?: string
  props?: Record<string, unknown>
}

export interface Paradigm {
  name: string
  description: string
  icon: string
}
