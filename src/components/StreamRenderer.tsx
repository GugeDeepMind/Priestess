import React, { useEffect, useRef } from 'react'

interface StreamRendererProps {
  text: string
  isStreaming: boolean
}

export function StreamRenderer({ text, isStreaming }: StreamRendererProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [text])

  return (
    <div className="stream-renderer">
      <span className="stream-text">{text}</span>
      {isStreaming && <span className="cursor-blink">|</span>}
      <div ref={endRef} />
    </div>
  )
}
