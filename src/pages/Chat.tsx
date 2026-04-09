import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MessageBubble, AgentCallBubble } from '../components/MessageBubble'
import { StreamRenderer } from '../components/StreamRenderer'
import { ReviewMarks } from '../components/ReviewMark'
import { BranchTreePanel } from '../components/BranchTree'
import { SettingsPopover } from '../components/SettingsPopover'
import { SystemPromptEditor } from '../components/SystemPromptEditor'
import { createConversation, streamChat, regenerateChat, listConversations, getConversationTree, deleteConversation, renameConversation } from '../services/api'
import type { Conversation, StreamEvent, ChatSettings, AttachedFile, AttachmentPayload } from '../types'
import { Send, Plus, MessageSquare, ArrowLeft, BookOpen, GitFork, ChevronLeft, ChevronRight, GitBranch, Pencil, Trash2, Check, X, Paperclip, SlidersHorizontal, FileText, RotateCcw, PenLine } from 'lucide-react'

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
  thinkingContent?: string
  // Branch info
  siblingCount?: number   // how many siblings at this level
  siblingIndex?: number   // which sibling we're showing (0-based)
  hasMultipleBranches?: boolean
  parentId?: string       // for branch switching
}

function ThinkingBlock({ content, defaultOpen = false }: { content: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="thinking-block">
      <button className="thinking-toggle" onClick={() => setOpen(v => !v)}>
        <span className="thinking-icon">{open ? '▼' : '▶'}</span>
        <span>思考过程</span>
        <span className="thinking-length">{content.length} 字</span>
      </button>
      {open && <div className="thinking-content">{content}</div>}
    </div>
  )
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
  const [streamingThinking, setStreamingThinking] = useState('')
  const [streamingInline, setStreamingInline] = useState<InlineContent[]>([])
  const [lastMessageId, setLastMessageId] = useState<string | null>(null)
  const [forkFromId, setForkFromId] = useState<string | null>(null) // which message to fork from
  const forkFromIdRef = useRef<string | null>(null)
  useEffect(() => { forkFromIdRef.current = forkFromId }, [forkFromId])
  const [treeData, setTreeData] = useState<{ roots: TreeNode[] } | null>(null)
  const [branchChoices, setBranchChoices] = useState<Record<string, number>>({}) // parentId -> childIndex
  const branchChoicesRef = useRef<Record<string, number>>({})
  useEffect(() => { branchChoicesRef.current = branchChoices }, [branchChoices])
  const [showTreePanel, setShowTreePanel] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Settings & upload state — persisted to localStorage
  const [temperature, setTemperature] = useState(() => {
    const v = localStorage.getItem('priestess_temperature')
    return v !== null ? parseFloat(v) : 1.0
  })
  const [maxTokens, setMaxTokens] = useState(() => {
    const v = localStorage.getItem('priestess_maxTokens')
    return v !== null ? parseInt(v) : 4096
  })
  const [thinkingIntensity, setThinkingIntensity] = useState<'none' | 'low' | 'medium' | 'high'>(() => {
    return (localStorage.getItem('priestess_thinking') as any) || 'none'
  })
  const [showSettings, setShowSettings] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [customSystemPrompt, setCustomSystemPrompt] = useState<string | null>(() => {
    return localStorage.getItem('priestess_systemPrompt')
  })
  const [agentName, setAgentName] = useState(() => {
    return localStorage.getItem('priestess_agentName') || '学习助手'
  })
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Persist settings to localStorage
  useEffect(() => { localStorage.setItem('priestess_temperature', String(temperature)) }, [temperature])
  useEffect(() => { localStorage.setItem('priestess_maxTokens', String(maxTokens)) }, [maxTokens])
  useEffect(() => { localStorage.setItem('priestess_thinking', thinkingIntensity) }, [thinkingIntensity])
  useEffect(() => {
    if (customSystemPrompt) localStorage.setItem('priestess_systemPrompt', customSystemPrompt)
    else localStorage.removeItem('priestess_systemPrompt')
  }, [customSystemPrompt])
  useEffect(() => { localStorage.setItem('priestess_agentName', agentName) }, [agentName])

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

      const choiceIdx = parentId ? (choices[parentId] ?? regularNodes.length - 1) : 0
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
      const choices = branchChoicesRef.current
      const flat = buildPathFromTree(tree, choices)
      setMessages(flat)
      setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
    } catch {
      setMessages([])
      setLastMessageId(null)
      setTreeData(null)
    }
  }, [buildPathFromTree])

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
    forkFromIdRef.current = null
  }

  const handleSelectConversation = async (convId: string) => {
    if (convId === activeConv) return  // already active — don't reset branch state
    setActiveConv(convId)
    setBranchChoices({})
    setForkFromId(null)
    forkFromIdRef.current = null
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
    forkFromIdRef.current = messageId
    inputRef.current?.focus()
  }

  const handleCancelFork = () => {
    setForkFromId(null)
    forkFromIdRef.current = null
  }

  // Find branch choices that navigate from root to a specific node
  const findPathChoices = useCallback((tree: { roots: TreeNode[] }, targetId: string): Record<string, number> | null => {
    const choices: Record<string, number> = {}

    const findPath = (nodes: TreeNode[], parentId?: string): boolean => {
      const regularNodes = nodes.filter(n => n.content_type !== 'image')
      for (let i = 0; i < regularNodes.length; i++) {
        const node = regularNodes[i]
        if (parentId) choices[parentId] = i
        if (node.id === targetId) return true
        if (node.children?.length && findPath(node.children, node.id)) return true
      }
      if (parentId) delete choices[parentId]
      return false
    }

    return findPath(tree.roots) ? choices : null
  }, [])

  const handleTreeNodeSelect = (nodeId: string) => {
    if (!treeData) return
    const newChoices = findPathChoices(treeData, nodeId)
    if (newChoices) {
      setBranchChoices(newChoices)
      const flat = buildPathFromTree(treeData, newChoices)
      setMessages(flat)
      setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
    }
  }

  // --- File handling helpers ---
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Strip data URL prefix "data:...;base64,"
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newAttached: AttachedFile[] = files.map(file => {
      const isImage = file.type.startsWith('image/')
      return { file, type: isImage ? 'image' : 'document' } as AttachedFile
    })
    // Generate previews for images
    newAttached.forEach(af => {
      if (af.type === 'image') {
        const reader = new FileReader()
        reader.onload = () => {
          af.preview = reader.result as string
          setAttachedFiles(prev => [...prev])  // trigger re-render
        }
        reader.readAsDataURL(af.file)
      }
    })
    setAttachedFiles(prev => [...prev, ...newAttached])
    // Reset file input so same file can be re-selected
    e.target.value = ''
  }

  // --- Retry: regenerate assistant response under the same user message ---
  const handleRetry = async (msg: DisplayMessage) => {
    if (isStreaming || !activeConv || msg.role !== 'user' || !msg.id || msg.id.startsWith('temp-')) return

    setIsStreaming(true)
    setStreamingText('')
    setStreamingThinking('')
    setStreamingInline([])

    const settings: ChatSettings = { temperature, max_tokens: maxTokens, thinking: thinkingIntensity }
    const agentCalls: DisplayMessage['agentCalls'] = []
    const inlineContent: InlineContent[] = []

    try {
      let fullText = ''
      let fullThinking = ''
      let doneMessageId: string | null = null
      for await (const event of regenerateChat(activeConv, msg.id, settings, customSystemPrompt)) {
        switch (event.type) {
          case 'thinking': fullThinking += event.content || ''; setStreamingThinking(fullThinking); break
          case 'text': fullText += event.content || ''; setStreamingText(fullText); break
          case 'call_start': agentCalls.push({ agentName: event.agent_name || '', callType: event.call_type || 'sync', instruction: event.instruction || event.content || '' }); break
          case 'call_result': fullText += event.content || ''; setStreamingText(fullText); if (agentCalls.length > 0) agentCalls[agentCalls.length - 1].result = event.content; break
          case 'image': inlineContent.push({ type: 'image', imageData: event.data, imageFormat: event.format || 'png', caption: event.caption || '' }); setStreamingInline([...inlineContent]); break
          case 'error': fullText += `\n[Error: ${event.content}]`; setStreamingText(fullText); break
          case 'done': doneMessageId = event.message_id || null; setLastMessageId(event.message_id || null); break
        }
      }

      // Reload tree and navigate to the new assistant message
      const tree = await getConversationTree(activeConv)
      setTreeData(tree)
      const pathChoices = doneMessageId ? findPathChoices(tree, doneMessageId) : null
      if (pathChoices) {
        setBranchChoices(pathChoices)
        const flat = buildPathFromTree(tree, pathChoices)
        setMessages(flat)
        setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
      } else {
        setBranchChoices(prev => {
          const updated = { ...prev, [msg.id]: 999 }
          const flat = buildPathFromTree(tree, updated)
          setMessages(flat)
          setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
          return updated
        })
      }
    } catch (err) {
      console.error('Regenerate error:', err)
    } finally {
      setIsStreaming(false)
      setStreamingText('')
      setStreamingThinking('')
      setStreamingInline([])
    }
  }

  // --- Edit: edit user message then resend as new branch ---
  const handleStartEdit = (msg: DisplayMessage) => {
    setEditingMsgId(msg.id)
    setEditingContent(msg.content)
  }

  const handleCancelEdit = () => {
    setEditingMsgId(null)
    setEditingContent('')
  }

  const handleConfirmEdit = (msg: DisplayMessage) => {
    const newContent = editingContent.trim()
    setEditingMsgId(null)
    setEditingContent('')
    if (!newContent || newContent === msg.content || !msg.parentId) return
    // Resend with edited content by forking from the parent
    handleRetryWithContent(msg.parentId, newContent)
  }

  const handleRetryWithContent = (forkParentId: string, content: string) => {
    if (isStreaming) return
    forkFromIdRef.current = forkParentId
    setForkFromId(forkParentId)
    setInput(content)
    setTimeout(() => {
      // Trigger handleSend programmatically
      const btn = document.querySelector('.send-btn') as HTMLButtonElement
      if (btn) btn.click()
    }, 50)
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
    // Read from state (captured in closure) with ref as fallback for programmatic sends
    const currentForkId = forkFromId ?? forkFromIdRef.current
    const parentId = currentForkId || lastMessageId
    console.log('[handleSend] forkFromId:', currentForkId, 'lastMessageId:', lastMessageId, '=> parentId:', parentId)

    // Prepare attachments as base64 payloads
    const attachmentPayloads: AttachmentPayload[] = []
    for (const af of attachedFiles) {
      const base64 = await fileToBase64(af.file)
      attachmentPayloads.push({
        type: af.type,
        media_type: af.file.type || 'application/octet-stream',
        data: base64,
        filename: af.file.name,
      })
    }

    // Build settings
    const settings: ChatSettings = { temperature, max_tokens: maxTokens, thinking: thinkingIntensity }

    // Add user message — if forking, truncate to fork point first
    const userMsg: DisplayMessage = {
      id: 'temp-user-' + Date.now(),
      role: 'user',
      content,
    }
    if (currentForkId) {
      // Truncate messages up to and including the fork-from message
      setMessages(prev => {
        const forkIdx = prev.findIndex(m => m.id === currentForkId)
        if (forkIdx >= 0) {
          return [...prev.slice(0, forkIdx + 1), userMsg]
        }
        return [...prev, userMsg]
      })
    } else {
      setMessages(prev => [...prev, userMsg])
    }
    setInput('')
    setAttachedFiles([])
    setForkFromId(null)
    forkFromIdRef.current = null
    setIsStreaming(true)
    setStreamingText('')
    setStreamingThinking('')
    setStreamingInline([])

    const agentCalls: DisplayMessage['agentCalls'] = []
    const inlineContent: InlineContent[] = []
    let reviewMarksCollected: any[] = []

    try {
      let fullText = ''
      let fullThinking = ''
      let doneMessageId: string | null = null
      for await (const event of streamChat(
        convId, content, parentId, settings,
        attachmentPayloads.length > 0 ? attachmentPayloads : null,
        customSystemPrompt,
      )) {
        switch (event.type) {
          case 'thinking':
            fullThinking += event.content || ''
            setStreamingThinking(fullThinking)
            break
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
            doneMessageId = event.message_id || null
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
        thinkingContent: fullThinking || undefined,
      }
      setMessages(prev => [...prev, assistantMsg])

      // Reload tree and navigate to the new message
      if (convId) {
        const tree = await getConversationTree(convId)
        setTreeData(tree)

        // Use DFS to find exact path to new assistant message, ensuring all
        // ancestor fork points are set correctly (not just the immediate parent)
        const targetId = doneMessageId
        const pathChoices = targetId ? findPathChoices(tree, targetId) : null
        if (pathChoices) {
          setBranchChoices(pathChoices)
          const flat = buildPathFromTree(tree, pathChoices)
          setMessages(flat)
          setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
        } else {
          // Fallback: select newest branch at fork point
          setBranchChoices(prev => {
            const updated = parentId ? { ...prev, [parentId]: 999 } : { ...prev }
            const flat = buildPathFromTree(tree, updated)
            setMessages(flat)
            setLastMessageId(flat.length > 0 ? flat[flat.length - 1].id : null)
            return updated
          })
        }
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
                {/* Edit mode for user messages */}
                {msg.role === 'user' && editingMsgId === msg.id ? (
                  <div className="message user editing">
                    <textarea
                      className="edit-textarea"
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleConfirmEdit(msg) }
                        if (e.key === 'Escape') handleCancelEdit()
                      }}
                      autoFocus
                    />
                    <div className="edit-actions">
                      <button className="edit-action-btn cancel" onClick={handleCancelEdit}>取消</button>
                      <button className="edit-action-btn confirm" onClick={() => handleConfirmEdit(msg)}>提交</button>
                    </div>
                  </div>
                ) : (
                  <MessageBubble
                    role={msg.role}
                    content={msg.role === 'assistant' ? '' : msg.content}
                    agentName={msg.agentName}
                  >
                    {msg.role === 'assistant' && (
                      <>
                        {msg.thinkingContent && <ThinkingBlock content={msg.thinkingContent} />}
                        <StreamRenderer text={msg.content} isStreaming={false} />
                      </>
                    )}
                  </MessageBubble>
                )}

                {/* User message actions: retry & edit */}
                {!isStreaming && msg.role === 'user' && msg.id && !msg.id.startsWith('temp-') && editingMsgId !== msg.id && (
                  <div className="user-msg-actions">
                    <button className="user-action-btn" title="重新生成" onClick={() => handleRetry(msg)}>
                      <RotateCcw size={14} />
                    </button>
                    <button className="user-action-btn" title="编辑" onClick={() => handleStartEdit(msg)}>
                      <PenLine size={14} />
                    </button>
                  </div>
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

              {/* Fork button — after all assistant content */}
              {!isStreaming && msg.role === 'assistant' && msg.id && !msg.id.startsWith('temp-') && (
                <button
                  className={`fork-btn${forkFromId === msg.id ? ' fork-active' : ''}`}
                  onClick={() => forkFromId === msg.id ? handleCancelFork() : handleFork(msg.id)}
                  title={forkFromId === msg.id ? "取消分支" : "从此处创建分支"}
                >
                  <GitFork size={14} />
                  <span className="fork-btn-label">{forkFromId === msg.id ? '取消分支' : '创建分支'}</span>
                </button>
              )}
            </React.Fragment>
          ))}

          {/* Currently streaming message */}
          {isStreaming && (
            <>
              <MessageBubble role="assistant" content="" agentName="teacher" isStreaming>
                {streamingThinking && <ThinkingBlock content={streamingThinking} defaultOpen={true} />}
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
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={forkFromId ? "输入内容创建新分支..." : activeConv ? "输入消息..." : "开始新对话..."}
              disabled={isStreaming}
              rows={1}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 150) + 'px'
              }}
            />
            <button className="send-btn" onClick={handleSend} disabled={isStreaming || !input.trim()}>
              <Send size={18} />
            </button>
          </div>
          {attachedFiles.length > 0 && (
            <div className="file-preview-row">
              {attachedFiles.map((af, i) => (
                <div key={i} className="file-chip">
                  {af.preview ? (
                    <img src={af.preview} alt={af.file.name} className="file-chip-thumb" />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span className="file-chip-name">{af.file.name}</span>
                  <button className="file-chip-remove" onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="input-toolbar">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <button className="toolbar-btn" title="上传文件" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={16} />
            </button>
            <div className="toolbar-settings-wrapper">
              <button className="toolbar-btn" title="模型设置" onClick={() => setShowSettings(v => !v)}>
                <SlidersHorizontal size={16} />
              </button>
              {showSettings && (
                <SettingsPopover
                  temperature={temperature}
                  maxTokens={maxTokens}
                  thinking={thinkingIntensity}
                  onTemperatureChange={setTemperature}
                  onMaxTokensChange={setMaxTokens}
                  onThinkingChange={setThinkingIntensity}
                  onClose={() => setShowSettings(false)}
                />
              )}
            </div>
            <button className="toolbar-btn" title="系统提示词" onClick={() => setShowPromptEditor(true)}>
              <FileText size={16} />
              {customSystemPrompt && <span className="toolbar-dot" />}
            </button>
          </div>

          {showPromptEditor && (
            <SystemPromptEditor
              agentName={agentName}
              systemPrompt={customSystemPrompt || ''}
              onSave={(name, prompt) => {
                setAgentName(name)
                setCustomSystemPrompt(prompt || null)
              }}
              onClose={() => setShowPromptEditor(false)}
            />
          )}
        </div>
      </main>
    </div>
  )
}
