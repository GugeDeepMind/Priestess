import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'

interface SystemPromptEditorProps {
  agentName: string
  systemPrompt: string
  onSave: (name: string, prompt: string) => void
  onClose: () => void
}

function estimateTokens(text: string): number {
  // Rough estimation: ~1.5 tokens per CJK char, ~0.75 tokens per word for English
  let count = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      count += 1.5
    } else if (/\s/.test(ch)) {
      count += 0.25
    } else {
      count += 0.4
    }
  }
  return Math.max(1, Math.round(count))
}

export function SystemPromptEditor({ agentName, systemPrompt, onSave, onClose }: SystemPromptEditorProps) {
  const [name, setName] = useState(agentName)
  const [prompt, setPrompt] = useState(systemPrompt)
  const [tokens, setTokens] = useState(0)

  useEffect(() => {
    setTokens(prompt ? estimateTokens(prompt) : 0)
  }, [prompt])

  const handleSave = () => {
    onSave(name, prompt)
    onClose()
  }

  return (
    <div className="prompt-editor-overlay" onClick={onClose}>
      <div className="prompt-editor-modal" onClick={e => e.stopPropagation()}>
        <div className="prompt-editor-header">
          <span>系统提示词</span>
          <button className="prompt-editor-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="prompt-editor-body">
          <label className="prompt-editor-label">名称</label>
          <div className="prompt-editor-name-row">
            <span className="prompt-editor-emoji">🤖</span>
            <input
              type="text"
              className="prompt-editor-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="助手名称"
            />
          </div>

          <label className="prompt-editor-label">提示词</label>
          <textarea
            className="prompt-editor-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="输入系统提示词..."
          />
        </div>

        <div className="prompt-editor-footer">
          <span className="token-counter">Tokens: {tokens}</span>
          <div className="prompt-editor-actions">
            <button className="prompt-editor-clear" onClick={() => { setPrompt(''); setName('学习助手') }}>
              清空(恢复默认)
            </button>
            <button className="prompt-editor-save" onClick={handleSave}>保存</button>
          </div>
        </div>
      </div>
    </div>
  )
}
