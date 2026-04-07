import React from 'react'
import type { StreamEvent } from '../types'

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  isStreaming?: boolean
  children?: React.ReactNode
}

export function MessageBubble({ role, content, agentName, isStreaming, children }: MessageBubbleProps) {
  return (
    <div className={`message ${role}`}>
      <div className="message-header">
        <span className={`role-label ${role}`}>
          {role === 'user' ? 'You' : agentName || 'Assistant'}
        </span>
        {isStreaming && <span className="streaming-dot" />}
      </div>
      <div className="message-content">
        {content}
        {children}
      </div>
    </div>
  )
}

interface AgentCallBubbleProps {
  agentName: string
  callType: string
  instruction: string
  result?: string
}

export function AgentCallBubble({ agentName, callType, instruction, result }: AgentCallBubbleProps) {
  return (
    <div className="message agent-call">
      <div className="message-header">
        <span className="role-label agent">
          {callType === 'sync' ? 'CALL' : 'ASYNC'}: {agentName}
        </span>
      </div>
      <div className="message-content agent-instruction">{instruction}</div>
      {result && <div className="message-content agent-result">{result}</div>}
    </div>
  )
}
