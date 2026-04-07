import React, { useState } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, Info, BookOpen } from 'lucide-react'

interface ReviewMark {
  segment_start: string
  verdict: string
  severity: 'info' | 'warning' | 'expand'
  reason: string
}

interface Props {
  marks: ReviewMark[]
}

const SEVERITY_STYLE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  expand: { icon: <BookOpen size={14} />, color: '#e94560', label: 'Needs expansion' },
  warning: { icon: <AlertTriangle size={14} />, color: '#f39c12', label: 'Could be clearer' },
  info: { icon: <Info size={14} />, color: '#3498db', label: 'Minor suggestion' },
}

export function ReviewMarks({ marks }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (!marks || marks.length === 0) return null

  const toggle = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="review-marks">
      <div className="review-header">
        <BookOpen size={14} />
        <span>Teaching Review ({marks.length} suggestions)</span>
      </div>
      {marks.map((mark, i) => {
        const style = SEVERITY_STYLE[mark.severity] || SEVERITY_STYLE.info
        const isOpen = expanded.has(i)
        return (
          <div key={i} className="review-mark-item" onClick={() => toggle(i)}>
            <div className="review-mark-header" style={{ borderLeftColor: style.color }}>
              <span className="review-icon" style={{ color: style.color }}>
                {style.icon}
              </span>
              <span className="review-segment">{mark.segment_start}</span>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {isOpen && (
              <div className="review-mark-detail">
                <span className="review-severity" style={{ color: style.color }}>
                  {style.label}
                </span>
                <p>{mark.reason}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
