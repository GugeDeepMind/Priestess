import React, { useEffect, useState } from 'react'
import { ArrowLeft, RotateCcw, ChevronDown, ChevronRight, Check, BookOpen, Circle } from 'lucide-react'

const BASE_URL = 'http://127.0.0.1:8000'

interface Props {
  onBack: () => void
}

const STATUS_STYLE: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  completed: { icon: <Check size={12} />, color: '#2ecc71', label: 'Done' },
  in_progress: { icon: <BookOpen size={12} />, color: '#f39c12', label: 'Learning' },
  untouched: { icon: <Circle size={12} />, color: '#555', label: 'Not started' },
}

function GraphNode({ name, node, path, onStatusChange }: {
  name: string
  node: any
  path: string[]
  onStatusChange: (path: string[], status: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.children && Object.keys(node.children).length > 0
  const style = STATUS_STYLE[node.status] || STATUS_STYLE.untouched
  const currentPath = [...path, name]

  const cycleStatus = (e: React.MouseEvent) => {
    e.stopPropagation()
    const order = ['untouched', 'in_progress', 'completed']
    const idx = order.indexOf(node.status)
    const next = order[(idx + 1) % order.length]
    onStatusChange(currentPath, next)
  }

  return (
    <div className="kg-node">
      <div className="kg-node-header" onClick={() => hasChildren && setExpanded(!expanded)}>
        {hasChildren ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : <span className="kg-spacer" />}
        <button className="kg-status-btn" onClick={cycleStatus} style={{ color: style.color }}>
          {style.icon}
        </button>
        <span className="kg-node-name">{name}</span>
        <span className="kg-node-status" style={{ color: style.color }}>{style.label}</span>
      </div>
      {expanded && hasChildren && (
        <div className="kg-children">
          {Object.entries(node.children).map(([childName, childNode]: [string, any]) => (
            <GraphNode
              key={childName}
              name={childName}
              node={childNode}
              path={currentPath}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function KnowledgeGraphPage({ onBack }: Props) {
  const [graph, setGraph] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`${BASE_URL}/api/knowledge-graph/default`)
      .then(r => r.json())
      .then(setGraph)
      .catch(() => {})
  }, [])

  const handleStatusChange = async (path: string[], status: string) => {
    // Update locally for instant feedback
    const updated = JSON.parse(JSON.stringify(graph))
    let node = updated
    for (const key of path) {
      if (node[key]) node = node[key]
      else if (node.children?.[key]) node = node.children[key]
      else break
    }
    node.status = status
    setGraph(updated)

    // Save to backend
    setSaving(true)
    await fetch(`${BASE_URL}/api/knowledge-graph/default`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graph: updated }),
    })
    setSaving(false)
  }

  const handleReset = async () => {
    await fetch(`${BASE_URL}/api/knowledge-graph/default/reset`, { method: 'POST' })
    const r = await fetch(`${BASE_URL}/api/knowledge-graph/default`)
    setGraph(await r.json())
  }

  return (
    <div className="kg-page">
      <div className="kg-header">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={18} /></button>
        <h2>Knowledge Graph</h2>
        <div className="kg-actions">
          {saving && <span className="kg-saving">Saving...</span>}
          <button className="icon-btn" onClick={handleReset} title="Reset to default">
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      <p className="kg-hint">Click status icons to cycle: Not started → Learning → Done</p>
      <div className="kg-tree">
        {Object.entries(graph).map(([name, node]) => (
          <GraphNode
            key={name}
            name={name}
            node={node}
            path={[]}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>
    </div>
  )
}
