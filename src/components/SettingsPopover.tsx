import React, { useRef, useEffect } from 'react'

interface SettingsPopoverProps {
  temperature: number
  maxTokens: number
  thinking: 'none' | 'low' | 'medium' | 'high'
  onTemperatureChange: (v: number) => void
  onMaxTokensChange: (v: number) => void
  onThinkingChange: (v: 'none' | 'low' | 'medium' | 'high') => void
  onClose: () => void
}

const THINKING_OPTIONS = [
  { value: 'none' as const, label: '关闭' },
  { value: 'low' as const, label: '低' },
  { value: 'medium' as const, label: '中' },
  { value: 'high' as const, label: '高' },
]

export function SettingsPopover({
  temperature, maxTokens, thinking,
  onTemperatureChange, onMaxTokensChange, onThinkingChange,
  onClose,
}: SettingsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const handleReset = () => {
    onTemperatureChange(1.0)
    onMaxTokensChange(4096)
    onThinkingChange('none')
  }

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-popover-header">
        <span>模型设置</span>
        <button className="settings-reset-btn" onClick={handleReset}>恢复默认</button>
      </div>

      <div className="settings-popover-row">
        <label className="settings-label">温度</label>
        <div className="settings-slider-row">
          <input
            type="range" className="settings-slider"
            min={0} max={2} step={0.1}
            value={temperature}
            onChange={e => onTemperatureChange(parseFloat(e.target.value))}
          />
          <span className="settings-value">{temperature.toFixed(1)}</span>
        </div>
      </div>

      <div className="settings-popover-row">
        <label className="settings-label">最大输出 Tokens</label>
        <div className="settings-slider-row">
          <input
            type="range" className="settings-slider"
            min={256} max={32768} step={256}
            value={maxTokens}
            onChange={e => onMaxTokensChange(parseInt(e.target.value))}
          />
          <span className="settings-value">{maxTokens}</span>
        </div>
      </div>

      <div className="settings-popover-row">
        <label className="settings-label">思考强度</label>
        <div className="thinking-selector">
          {THINKING_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`thinking-option${thinking === opt.value ? ' active' : ''}`}
              onClick={() => onThinkingChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
