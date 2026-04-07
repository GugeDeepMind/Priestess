import React, { useState } from 'react'
import { ChevronDown, ChevronRight, User, Bot, GitFork } from 'lucide-react'

interface TreeNode {
  id: string
  role: string
  content: string
  agent_name?: string
  content_type?: string
  children: TreeNode[]
}

interface BranchSegment {
  startNode: TreeNode
  messageCount: number
  lastNodeId: string
  children: BranchSegment[][]  // each array is a set of sibling branches
}

// Walk tree and build condensed branch segments
function buildSegments(nodes: TreeNode[]): BranchSegment[][] {
  if (!nodes.length) return []

  const regularNodes = nodes.filter(n => n.content_type !== 'image')
  if (!regularNodes.length) return []

  // If multiple siblings at this level, each is a separate branch
  return [regularNodes.map(node => buildSingleSegment(node))]
}

function buildSingleSegment(node: TreeNode): BranchSegment {
  let current = node
  let count = 1
  let lastId = node.id

  // Follow linear chain (single child each step) until we hit a branch point or leaf
  while (true) {
    const regularChildren = (current.children || []).filter(c => c.content_type !== 'image')
    if (regularChildren.length === 1) {
      current = regularChildren[0]
      count++
      lastId = current.id
    } else {
      break
    }
  }

  // At this point, current is either a leaf or has multiple children (branch point)
  const regularChildren = (current.children || []).filter(c => c.content_type !== 'image')
  const childBranches: BranchSegment[][] = []
  if (regularChildren.length > 1) {
    childBranches.push(regularChildren.map(child => buildSingleSegment(child)))
  }

  return {
    startNode: node,
    messageCount: count,
    lastNodeId: lastId,
    children: childBranches,
  }
}

interface Props {
  tree: { roots: TreeNode[] } | null
  onSelectNode: (nodeId: string) => void
  currentNodeId?: string | null
}

function SegmentItem({ segment, depth, onSelect, currentId }: {
  segment: BranchSegment
  depth: number
  onSelect: (id: string) => void
  currentId?: string | null
}) {
  const [expanded, setExpanded] = useState(true)
  const hasBranches = segment.children.length > 0
  const preview = segment.startNode.content.slice(0, 35).replace(/\n/g, ' ')
  const isUser = segment.startNode.role === 'user'

  return (
    <div className="bt-segment">
      <div
        className={`bt-seg-row ${currentId === segment.lastNodeId ? 'bt-current' : ''}`}
        onClick={() => onSelect(segment.lastNodeId)}
      >
        {hasBranches ? (
          <span className="bt-expand" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        ) : (
          <span className="bt-expand"><span className="bt-dot" /></span>
        )}
        <span className={`bt-role-icon ${segment.startNode.role}`}>
          {isUser ? <User size={10} /> : <Bot size={10} />}
        </span>
        <span className="bt-preview">{preview || '...'}</span>
        <span className="bt-msg-count">{segment.messageCount}</span>
      </div>

      {expanded && hasBranches && segment.children.map((branchGroup, gi) => (
        <div key={gi} className="bt-branch-group">
          <div className="bt-branch-label">
            <GitFork size={10} />
            <span>{branchGroup.length} branches</span>
          </div>
          <div className="bt-branches">
            {branchGroup.map((branch, bi) => (
              <SegmentItem
                key={bi}
                segment={branch}
                depth={depth + 1}
                onSelect={onSelect}
                currentId={currentId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function BranchTreePanel({ tree, onSelectNode, currentNodeId }: Props) {
  if (!tree?.roots?.length) {
    return (
      <div className="bt-panel">
        <div className="bt-header">BRANCHES</div>
        <div className="bt-empty">No messages yet</div>
      </div>
    )
  }

  const roots = tree.roots.filter(r => r.content_type !== 'image')
  const segments = roots.map(r => buildSingleSegment(r))

  return (
    <div className="bt-panel">
      <div className="bt-header">BRANCHES</div>
      <div className="bt-tree">
        {segments.map((seg, i) => (
          <SegmentItem
            key={i}
            segment={seg}
            depth={0}
            onSelect={onSelectNode}
            currentId={currentNodeId}
          />
        ))}
      </div>
    </div>
  )
}
