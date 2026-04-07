// src/components/annotation/AnnotationToolbar.tsx
// tool selection bar for the annotation editor — pen, text, color, undo, clear

import { memo } from 'react'
import { Pen, RotateCcw, Trash2, Type } from 'lucide-react'

import type { AnnotationTool } from '../../hooks/useAnnotationCanvas'

interface AnnotationToolbarProps
{
  activeTool: AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  color: string
  onColorChange: (color: string) => void
  strokeWidth: number
  onStrokeWidthChange: (width: number) => void
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
}

export const AnnotationToolbar = memo(
  ({
    activeTool,
    onToolChange,
    color,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    canUndo,
    onUndo,
    onClear,
  }: AnnotationToolbarProps) => (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2">
      {/* tool buttons */}
      <button
        type="button"
        onClick={() => onToolChange('pen')}
        className={`rounded-md p-2 transition-colors ${
          activeTool === 'pen'
            ? 'bg-[var(--t-accent)] text-white'
            : 'text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]'
        }`}
        title="Freehand Pen"
      >
        <Pen className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onToolChange('text')}
        className={`rounded-md p-2 transition-colors ${
          activeTool === 'text'
            ? 'bg-[var(--t-accent)] text-white'
            : 'text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]'
        }`}
        title="Text"
      >
        <Type className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-[var(--t-border)]" />

      {/* color picker */}
      <input
        type="color"
        value={color}
        onChange={(e) => onColorChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
        title="Annotation color"
      />

      {/* stroke width slider */}
      {activeTool === 'pen' && (
        <input
          type="range"
          min={1}
          max={10}
          value={strokeWidth}
          onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
          className="w-20 accent-[var(--t-accent)]"
          title={`Stroke width: ${strokeWidth}`}
        />
      )}

      <div className="mx-1 h-5 w-px bg-[var(--t-border)]" />

      {/* undo & clear */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded-md p-2 text-[var(--t-text-secondary)] transition-colors hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-30"
        title="Undo"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!canUndo}
        className="rounded-md p-2 text-[var(--t-text-secondary)] transition-colors hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-30"
        title="Clear All"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
)
