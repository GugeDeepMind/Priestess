import React from 'react'
import { GitBranch } from 'lucide-react'

interface Suggestion {
  title: string
  description: string
}

interface Props {
  suggestions: Suggestion[]
  onSelect: (title: string) => void
}

export function BranchSuggestions({ suggestions, onSelect }: Props) {
  if (!suggestions || suggestions.length === 0) return null

  return (
    <div className="branch-suggestions">
      <div className="branch-header">
        <GitBranch size={14} />
        <span>Suggested explorations</span>
      </div>
      {suggestions.map((s, i) => (
        <button
          key={i}
          className="branch-item"
          onClick={() => onSelect(s.title)}
        >
          <span className="branch-title">{s.title}</span>
          {s.description && <span className="branch-desc">{s.description}</span>}
        </button>
      ))}
    </div>
  )
}
