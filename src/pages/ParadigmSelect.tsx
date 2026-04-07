import React, { useEffect, useState } from 'react'
import { listParadigms } from '../services/api'
import type { Paradigm } from '../types'
import { BookOpen, MessageSquare, Sparkles } from 'lucide-react'

// Default icons for paradigms that don't have custom ones
const PARADIGM_ICONS: Record<string, React.ReactNode> = {
  layered_teaching: <BookOpen size={40} />,
  simple_chat: <MessageSquare size={40} />,
}

interface Props {
  onSelect: (paradigmName: string) => void
}

export function ParadigmSelect({ onSelect }: Props) {
  const [paradigms, setParadigms] = useState<Paradigm[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listParadigms()
      .then(setParadigms)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="paradigm-select">
      <div className="paradigm-header">
        <Sparkles size={32} className="paradigm-logo" />
        <h1>Priestess</h1>
        <p className="paradigm-subtitle">Choose a paradigm to begin</p>
      </div>

      <div className="paradigm-grid">
        {loading ? (
          <div className="paradigm-loading">Loading paradigms...</div>
        ) : (
          paradigms.map(p => (
            <button
              key={p.name}
              className="paradigm-card"
              onClick={() => onSelect(p.name)}
            >
              <div className="paradigm-icon">
                {PARADIGM_ICONS[p.name] || <Sparkles size={40} />}
              </div>
              <h3>{p.name.replace(/_/g, ' ')}</h3>
              <p>{p.description}</p>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
