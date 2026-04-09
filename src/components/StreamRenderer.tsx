import React, { useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

interface StreamRendererProps {
  text: string
  isStreaming: boolean
}

function CodeBlock({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const codeRef = useRef<HTMLElement>(null)
  const [copied, setCopied] = React.useState(false)

  const isInline = !className
  if (isInline) {
    return <code className={className} {...props}>{children}</code>
  }

  const lang = className?.replace('language-', '') || ''

  const handleCopy = useCallback(() => {
    const text = codeRef.current?.textContent || ''
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {lang && <span className="code-lang">{lang}</span>}
        <button className="code-copy-btn" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <code ref={codeRef} className={className} {...props}>{children}</code>
    </div>
  )
}

export function StreamRenderer({ text, isStreaming }: StreamRendererProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [text])

  return (
    <div className="stream-renderer markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          pre({ children }) {
            return <pre>{children}</pre>
          },
          code({ className, children, ...props }) {
            return <CodeBlock className={className} {...props}>{children}</CodeBlock>
          },
        }}
      >
        {text || ''}
      </ReactMarkdown>
      {isStreaming && <span className="cursor-blink">|</span>}
      <div ref={endRef} />
    </div>
  )
}
