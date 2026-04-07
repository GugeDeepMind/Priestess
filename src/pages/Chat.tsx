import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageBubble, AgentCallBubble } from '../components/MessageBubble'
import { StreamRenderer } from '../components/StreamRenderer'
import { ReviewMarks } from '../components/ReviewMark'
import { BranchTreePanel } from '../components/BranchTree'
import { createConversation, streamChat, listConversations, getConversationTree, deleteConversation, renameConversation } from '../services/api'
import type { Conversation, StreamEvent } from '../types'
import { Send, Plus, MessageSquare, ArrowLeft, BookOpen, GitFork, ChevronLeft, ChevronRight, GitBranch, Pencil, Trash2, Check, X } from 'lucide-react'

interface InlineContent {
  type: 'text' | 'image' | 'ui'
  text?: string
  imageData?: string
  imageFormat?: string
  caption?: string
  component?: string
  props?: Record<string, unknown>
}

interface TreeNode {
  id: string
  role: string
  content: string
  agent_name?: string
  content_type?: string
  children: TreeNode[]
}

interface DisplayMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentName?: string
  agentCalls?: { agentName: string; callType: string; instruction: string; result?: string }[]
  inlineContent?: InlineContent[]
  reviewMarks?: any[]
  // Branch info
  siblingCount?: number   // how many siblings at this level
  siblingIndex?: number   // which sibling we're showing (0-based)
  hasMultipleBranches?: boolean
  parentId?: string       // for branch switching
}

interface ChatProps {
  paradigm: string
  onBack: () => void
  onOpenKnowledgeGraph?: () => void
}

export function Chat({ paradigm, onBack, onOpenKnowledgeGraph }: ChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingInline, setStreamingInline] = useState<InlineContent[]>([])
  const [lastMessageId, setLastMessageId] = useState<string | null>(null)
  const [forkFromId, setForkFromId] = useState<string | null>(null) // which message to fork from
  const [treeData, setTreeData] = useState<{ roots: TreeNode[] } | null>(null)
  const [branchChoices, setBranchChoices] = useState<Record<string, number>>({}) // parentId -> childIndex
  const [showTreePanel, setShowTreePanel] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamingText, scrollToBottom])

  useEffect(() => {
    listConversations()
      .then(convs => setConversations(convs.filter(c => c.paradigm === paradigm)))
      .catch(() => {})
  }, [paradigm])

  // Build display messages from tree + branch choices
  const buildPathFromTree = useCallback((tree: { roots: TreeNode[] }, choices: Record<string, number>) => {
    const flat: DisplayMessage[] = []

    const walk = (nodes: TreeNode[], parentId?: string) => {
      if (nodes.length === 0) return

      // Separate image nodes from regular nodes
      const regularNodes = nodes.filter(n => n.content_type !== 'image')
      const imageNodes = nodes.filter(n => n.content_type === 'image')

      // If there are only image nodes (no regular children), they belong to parent
      // Attach images to the last message in flat
      if (imageNodes.length > 0 && flat.length > 0) {
        const parentMsg = flat[flat.length - 1]
        const images: InlineContent[] = imageNodes.map(img => {
          try {
            const data = JSON.parse(img.content)
            return {
              type: 'image' as const,
              imageData: data.data,
              imageFormat: data.format || 'png',
              caption: data.caption || '',
            }
          } catch {
            return null
          }
        }).filter(Boolean) as InlineContent[]
        if (images.length > 0) {
          parentMsg.inlineContent = [...(parentMsg.inlineContent || []), ...images]
        }
      }

      if (regularNodes.length === 0) return

      const choiceIdx = parentId ? (choices[parentId] ?? 0) : 0
      const idx = Math.min(choiceIdx, regularNodes.length - 1)
      const node = regularNodes[idx]

      flat.push({
        id: node.id,
        role: node.role as 'user' | 'assistant',
        content: node.content,
        agentName: node.agent_name,
        siblingCount: regularNodes.length,
        siblingIndex: idx,
        hasMultipleBranches: regularNodes.length > 1,
        parentId,
      })

      if (node.children?.length) {
        walk(node.children, node.id)
      }
    }

    if (tree.roots?.length) {
      walk(tree.roots)
    }
    return flat
  }, [])

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const tree = await getConversationTree(convId)
      setTreeData(tree)
      const choices = branchChoices
      const flat = buildPathFromTree(tree, choices)
      setMessages(flat)
      setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
    } catch {
      setMessages([])
      setLastMessageId(null)
      setTreeData(null)
    }
  }, [branchChoices, buildPathFromTree])

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteConversation(convId)
    setConversations(prev => prev.filter(c => c.id !== convId))
    if (activeConv === convId) {
      setActiveConv(null)
      setMessages([])
      setLastMessageId(null)
      setTreeData(null)
      setShowTreePanel(false)
    }
  }

  const handleStartRename = (convId: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(convId)
    setRenameValue(currentTitle)
  }

  const handleConfirmRename = async (convId: string) => {
    const trimmed = renameValue.trim()
    if (trimmed) {
      await renameConversation(convId, trimmed)
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, title: trimmed } : c))
    }
    setRenamingId(null)
  }

  const handleCancelRename = () => {
    setRenamingId(null)
  }

  const handleNewConversation = async () => {
    const conv = await createConversation('New Chat', paradigm)
    setConversations(prev => [conv, ...prev])
    setActiveConv(conv.id)
    setMessages([])
    setLastMessageId(null)
    setTreeData(null)
    setBranchChoices({})
    setForkFromId(null)
  }

  const handleSelectConversation = async (convId: string) => {
    setActiveConv(convId)
    setBranchChoices({})
    setForkFromId(null)
    await loadConversation(convId)
  }

  const handleSwitchBranch = (parentId: string, direction: 'prev' | 'next', siblingCount: number) => {
    setBranchChoices(prev => {
      const current = prev[parentId] ?? 0
      let next = direction === 'next' ? current + 1 : current - 1
      if (next < 0) next = siblingCount - 1
      if (next >= siblingCount) next = 0
      const updated = { ...prev, [parentId]: next }

      // Rebuild path with new choice
      if (treeData) {
        const flat = buildPathFromTree(treeData, updated)
        setMessages(flat)
        setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
      }
      return updated
    })
  }

  const handleFork = (messageId: string) => {
    setForkFromId(messageId)
    inputRef.current?.focus()
  }

  const handleCancelFork = () => {
    setForkFromId(null)
  }

  const handleTreeNodeSelect = (nodeId: string) => {
    if (!treeData) return
    // Find the path from root to this node and set branch choices
    const newChoices: Record<string, number> = {}

    const findPath = (nodes: TreeNode[], parentId?: string): boolean => {
      const regularNodes = nodes.filter(n => n.content_type !== 'image')
      for (let i = 0; i < regularNodes.length; i++) {
        const node = regularNodes[i]
        if (parentId) newChoices[parentId] = i
        if (node.id === nodeId) return true
        if (node.children?.length && findPath(node.children, node.id)) return true
      }
      if (parentId) delete newChoices[parentId]
      return false
    }

    if (findPath(treeData.roots)) {
      setBranchChoices(newChoices)
      const flat = buildPathFromTree(treeData, newChoices)
      setMessages(flat)
      setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
    }
  }

  const handleSend = async () => {
    const content = input.trim()
    if (!content || isStreaming) return

    let convId = activeConv
    if (!convId) {
      const conv = await createConversation('New Chat', paradigm)
      setConversations(prev => [conv, ...prev])
      convId = conv.id
      setActiveConv(convId)
    }

    // Determine parent: fork target or last message in current path
    const parentId = forkFromId || lastMessageId

    // Add user message — if forking, truncate to fork point first
    const userMsg: DisplayMessage = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content,
    }
    if (forkFromId) {
      // Truncate messages up to and including the fork-from message
      setMessages(prev => {
        const forkIdx = prev.findIndex(m => m.id === forkFromId)
        if (forkIdx >= 0) {
          return [...prev.slice(0, forkIdx + 1), userMsg]
        }
        return [...prev, userMsg]
      })
    } else {
      setMessages(prev => [...prev, userMsg])
    }
    setInput('')
    setForkFromId(null)
    setIsStreaming(true)
    setStreamingText('')
    setStreamingInline([])

    const agentCalls: DisplayMessage['agentCalls'] = []
    const inlineContent: InlineContent[] = []
    let reviewMarksCollected: any[] = []

    try {
      let fullText = ''
      for await (const event of streamChat(convId, content, parentId)) {
        switch (event.type) {
          case 'text':
            fullText += event.content || ''
            setStreamingText(fullText)
            break
          case 'call_start':
            agentCalls.push({
              agentName: event.agent_name || '',
              callType: event.call_type || 'sync',
              instruction: event.instruction || event.content || '',
            })
            break
          case 'call_result':
            fullText += event.content || ''
            setStreamingText(fullText)
            if (agentCalls.length > 0) {
              agentCalls[agentCalls.length - 1].result = event.content
            }
            break
          case 'image':
            inlineContent.push({
              type: 'image',
              imageData: event.data,
              imageFormat: event.format || 'png',
              caption: event.caption || '',
            })
            setStreamingInline([...inlineContent])
            break
          case 'async_started':
            agentCalls.push({
              agentName: event.agent_name || '',
              callType: 'async',
              instruction: event.instruction || event.content || '',
            })
            break
          case 'error':
            fullText += `\n[Error: ${event.content}]`
            setStreamingText(fullText)
            break
          case 'ui':
            if (event.component === 'ReviewMarks') {
              reviewMarksCollected = event.props?.marks as any[] || []
            }
            break
          case 'done':
            setLastMessageId(event.message_id || null)
            break
        }
      }

      const assistantMsg: DisplayMessage = {
        id: 'msg-' + Date.now(),
        role: 'assistant',
        content: fullText,
        agentName: 'teacher',
        agentCalls: agentCalls.length > 0 ? agentCalls : undefined,
        inlineContent: inlineContent.length > 0 ? inlineContent : undefined,
        reviewMarks: reviewMarksCollected.length > 0 ? reviewMarksCollected : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])

      // Reload tree and rebuild path
      if (convId) {
        const tree = await getConversationTree(convId)
        setTreeData(tree)

        // Rebuild messages from tree, selecting the newest branch at fork point
        setBranchChoices(prev => {
          const updated = parentId ? { ...prev, [parentId]: 999 } : { ...prev }
          const flat = buildPathFromTree(tree, updated)
          setMessages(flat)
          setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
          return updated
        })
      }
    } catch (err) {
      console.error('Stream error:', err)
    } finally {
      setIsStreaming(false)
      setStreamingText('')
      setStreamingInline([])
      inputRef.current?.focus()
    }
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="icon-btn" onClick={onBack} title="Back to paradigms">
            <ArrowLeft size={18} />
          </button>
          <h2>{paradigm.replace(/_/g, ' ')}</h2>
          <button className="icon-btn" onClick={handleNewConversation} title="New Chat">
            <Plus size={18} />
          </button>
        </div>
        <div className="conversation-list">
          {conversations.map(c => (
            <div
              key={c.id}
              className={`conv-item ${c.id === activeConv ? 'active' : ''}`}
            >
              {renamingId === c.id ? (
                <div className="conv-rename">
                  <input
                    className="conv-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleConfirmRename(c.id)
                      if (e.key === 'Escape') handleCancelRename()
                    }}
                    autoFocus
                  />
                  <button className="conv-action-btn" onClick={() => handleConfirmRename(c.id)} title="Confirm">
                    <Check size={12} />
                  </button>
                  <button className="conv-action-btn" onClick={handleCancelRename} title="Cancel">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="conv-item-main" onClick={() => handleSelectConversation(c.id)}>
                    <MessageSquare size={14} />
                    <span>{c.title}</span>
                  </div>
                  <div className="conv-actions">
                    <button className="conv-action-btn" onClick={(e) => handleStartRename(c.id, c.title, e)} title="Rename">
                      <Pencil size={12} />
                    </button>
                    <button className="conv-action-btn conv-delete-btn" onClick={(e) => handleDeleteConversation(c.id, e)} title="Delete">
                      <Trash2 size={12} />
                    </button>
                    {c.id === activeConv && (
                      <button
                        className={`conv-action-btn ${showTreePanel ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setShowTreePanel(!showTreePanel) }}
                        title="Show branch tree"
                      >
                        <GitBranch size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        {onOpenKnowledgeGraph && (
          <div className="sidebar-footer">
            <button className="kg-btn" onClick={onOpenKnowledgeGraph}>
              <BookOpen size={14} />
              <span>Knowledge Graph</span>
            </button>
          </div>
        )}
      </aside>

      {/* Branch tree panel */}
      {showTreePanel && (
        <BranchTreePanel
          tree={treeData}
          onSelectNode={handleTreeNodeSelect}
          currentNodeId={lastMessageId}
        />
      )}

      {/* Main chat area */}
      <main className="chat-main">
        <div className="messages-area">
          {messages.map(msg => (
            <React.Fragment key={msg.id}>
              {/* Branch indicator */}
              {msg.hasMultipleBranches && msg.parentId && (
                <div className="branch-indicator">
                  <button
                    className="branch-nav-btn"
                    onClick={() => handleSwitchBranch(msg.parentId!, 'prev', msg.siblingCount!)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="branch-label">
                    Branch {(msg.siblingIndex ?? 0) + 1} / {msg.siblingCount}
                  </span>
                  <button
                    className="branch-nav-btn"
                    onClick={() => handleSwitchBranch(msg.parentId!, 'next', msg.siblingCount!)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              <div className={`message-wrapper ${forkFromId === msg.id ? 'fork-target' : ''}`}>
                <MessageBubble
                  role={msg.role}
                  content={msg.role === 'assistant' ? '' : msg.content}
                  agentName={msg.agentName}
                >
                  {msg.role === 'assistant' && (
                    <StreamRenderer text={msg.content} isStreaming={false} />
                  )}
                </MessageBubble>

                {/* Fork button */}
                {!isStreaming && msg.id && !msg.id.startsWith('temp-') && (
                  <button
                    className="fork-btn"
                    onClick={() => forkFromId === msg.id ? handleCancelFork() : handleFork(msg.id)}
                    title={forkFromId === msg.id ? "Cancel fork" : "Branch from here"}
                  >
                    <GitFork size={14} />
                  </button>
                )}
              </div>

              {msg.agentCalls?.map((call, i) => (
                <AgentCallBubble key={`${msg.id}-call-${i}`} {...call} />
              ))}
              {msg.inlineContent?.map((ic, i) => (
                ic.type === 'image' && ic.imageData ? (
                  <div key={`${msg.id}-img-${i}`} className="message inline-image">
                    <img
                      src={`data:image/${ic.imageFormat || 'png'};base64,${ic.imageData}`}
                      alt={ic.caption || 'Chart'}
                    />
                    {ic.caption && <div className="image-caption">{ic.caption}</div>}
                  </div>
                ) : null
              ))}
              {msg.reviewMarks && <ReviewMarks marks={msg.reviewMarks} />}
            </React.Fragment>
          ))}

          {/* Currently streaming message */}
          {isStreaming && (
            <>
              <MessageBubble role="assistant" content="" agentName="teacher" isStreaming>
                <StreamRenderer text={streamingText} isStreaming={true} />
              </MessageBubble>
              {streamingInline.map((ic, i) => (
                ic.type === 'image' && ic.imageData ? (
                  <div key={`stream-img-${i}`} className="message inline-image">
                    <img
                      src={`data:image/${ic.imageFormat || 'png'};base64,${ic.imageData}`}
                      alt={ic.caption || 'Chart'}
                    />
                    {ic.caption && <div className="image-caption">{ic.caption}</div>}
                  </div>
                ) : null
              ))}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          {forkFromId && (
            <div className="fork-notice">
              <GitFork size={12} />
              <span>Branching from message</span>
              <button onClick={handleCancelFork}>&times;</button>
            </div>
          )}
          <div className="input-row">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend() }}
              placeholder={forkFromId ? "Type to create a new branch..." : activeConv ? "Type a message..." : "Start a new conversation..."}
              disabled={isStreaming}
            />
            <button className="send-btn" onClick={handleSend} disabled={isStreaming || !input.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
