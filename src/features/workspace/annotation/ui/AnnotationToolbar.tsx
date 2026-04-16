// src/features/workspace/annotation/ui/AnnotationToolbar.tsx
// annotation toolbar — tool selection, text formatting (Google Docs-style), & actions

import { memo, useCallback } from 'react'
import {
  Bold,
  ChevronDown,
  Italic,
  Minus,
  Pen,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react'

import type {
  AnnotationFontFamily,
  AnnotationTool,
  TextStyle,
} from '@/features/workspace/annotation/model/useAnnotationCanvas'
import { FONT_FAMILY_LABELS } from '@/features/workspace/annotation/model/useAnnotationCanvas'
import { ColorInput } from '@/shared/ui/ColorInput'

const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 36, 48, 60]

interface AnnotationToolbarProps
{
  activeTool: AnnotationTool
  onToolChange: (tool: AnnotationTool) => void
  color: string
  onColorChange: (color: string) => void
  strokeWidth: number
  onStrokeWidthChange: (width: number) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  textStyle: TextStyle
  onTextStyleChange: (style: TextStyle) => void
  canUndo: boolean
  onUndo: () => void
  onClear: () => void
}

// render a bold/italic toggle button — Google Docs-style pressed state
const FormatToggle = ({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`rounded p-1.5 transition-colors ${
      active
        ? 'bg-[rgb(var(--t-overlay)/0.12)] text-[var(--t-text)]'
        : 'text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]'
    }`}
  >
    {children}
  </button>
)

export const AnnotationToolbar = memo(
  ({
    activeTool,
    onToolChange,
    color,
    onColorChange,
    strokeWidth,
    onStrokeWidthChange,
    fontSize,
    onFontSizeChange,
    textStyle,
    onTextStyleChange,
    canUndo,
    onUndo,
    onClear,
  }: AnnotationToolbarProps) =>
  {
    const toggleBold = useCallback(
      () => onTextStyleChange({ ...textStyle, bold: !textStyle.bold }),
      [onTextStyleChange, textStyle]
    )
    const toggleItalic = useCallback(
      () => onTextStyleChange({ ...textStyle, italic: !textStyle.italic }),
      [onTextStyleChange, textStyle]
    )
    const setFontFamily = useCallback(
      (fontFamily: AnnotationFontFamily) =>
        onTextStyleChange({ ...textStyle, fontFamily }),
      [onTextStyleChange, textStyle]
    )

    const decrementFontSize = useCallback(() =>
    {
      const idx = FONT_SIZE_PRESETS.findIndex((s) => s >= fontSize)
      const prev = idx > 0 ? FONT_SIZE_PRESETS[idx - 1] : FONT_SIZE_PRESETS[0]
      onFontSizeChange(prev)
    }, [fontSize, onFontSizeChange])

    const incrementFontSize = useCallback(() =>
    {
      const idx = FONT_SIZE_PRESETS.findIndex((s) => s > fontSize)
      const next =
        idx !== -1
          ? FONT_SIZE_PRESETS[idx]
          : FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1]
      onFontSizeChange(next)
    }, [fontSize, onFontSizeChange])

    return (
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-2 py-1.5">
        {/* tool selection */}
        <button
          type="button"
          onClick={() => onToolChange('pen')}
          className={`rounded-md p-2 transition-colors ${
            activeTool === 'pen'
              ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
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
              ? 'bg-[var(--t-accent)] text-[var(--t-accent-foreground)]'
              : 'text-[var(--t-text-secondary)] hover:bg-[rgb(var(--t-overlay)/0.06)]'
          }`}
          title="Text"
        >
          <Type className="h-4 w-4" />
        </button>

        <div className="mx-0.5 h-5 w-px bg-[var(--t-border)]" />

        {/* color picker */}
        <ColorInput
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          title="Annotation color"
        />

        <div className="mx-0.5 h-5 w-px bg-[var(--t-border)]" />

        {/* pen-specific: stroke width */}
        {activeTool === 'pen' && (
          <>
            <input
              type="range"
              min={1}
              max={10}
              value={strokeWidth}
              onChange={(e) => onStrokeWidthChange(Number(e.target.value))}
              className="w-20 accent-[var(--t-accent)]"
              title={`Stroke width: ${strokeWidth}`}
            />
            <span className="min-w-[1.5rem] text-center text-xs text-[var(--t-text-faint)]">
              {strokeWidth}px
            </span>
          </>
        )}

        {/* text-specific: Google Docs-style formatting bar */}
        {activeTool === 'text' && (
          <>
            {/* font family dropdown */}
            <div className="relative">
              <select
                value={textStyle.fontFamily}
                onChange={(e) =>
                  setFontFamily(e.target.value as AnnotationFontFamily)
                }
                className="h-7 appearance-none rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] pr-6 pl-2 text-xs text-[var(--t-text)] outline-none"
                title="Font family"
              >
                {(
                  Object.entries(FONT_FAMILY_LABELS) as [
                    AnnotationFontFamily,
                    string,
                  ][]
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 text-[var(--t-text-faint)]" />
            </div>

            <div className="mx-0.5 h-5 w-px bg-[var(--t-border)]" />

            {/* font size — minus / value / plus (Docs-style stepper) */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={decrementFontSize}
                disabled={fontSize <= FONT_SIZE_PRESETS[0]}
                className="rounded p-1 text-[var(--t-text-secondary)] transition-colors hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-30"
                title="Decrease font size"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                type="number"
                value={fontSize}
                onChange={(e) =>
                {
                  const n = parseInt(e.target.value, 10)
                  if (!isNaN(n) && n >= 6 && n <= 120)
                  {
                    onFontSizeChange(n)
                  }
                }}
                className="h-6 w-9 rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-center text-xs text-[var(--t-text)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                title="Font size"
                min={6}
                max={120}
              />
              <button
                type="button"
                onClick={incrementFontSize}
                disabled={
                  fontSize >= FONT_SIZE_PRESETS[FONT_SIZE_PRESETS.length - 1]
                }
                className="rounded p-1 text-[var(--t-text-secondary)] transition-colors hover:bg-[rgb(var(--t-overlay)/0.06)] disabled:opacity-30"
                title="Increase font size"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            <div className="mx-0.5 h-5 w-px bg-[var(--t-border)]" />

            {/* bold & italic toggles */}
            <FormatToggle
              active={textStyle.bold}
              onClick={toggleBold}
              title="Bold (B)"
            >
              <Bold className="h-4 w-4" />
            </FormatToggle>
            <FormatToggle
              active={textStyle.italic}
              onClick={toggleItalic}
              title="Italic (I)"
            >
              <Italic className="h-4 w-4" />
            </FormatToggle>
          </>
        )}

        <div className="mx-0.5 h-5 w-px bg-[var(--t-border)]" />

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
          title="Clear all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }
)
