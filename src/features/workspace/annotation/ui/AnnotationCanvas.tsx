// src/features/workspace/annotation/ui/AnnotationCanvas.tsx
// canvas overlay for drawing annotations on top of a background image

import { memo, useCallback, useEffect, useRef, useState } from 'react'

import type { PendingTextInput } from '~/features/workspace/annotation/model/useAnnotationCanvas'

interface AnnotationCanvasProps
{
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  backgroundImage: string
  captureTouchGestures: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onClick: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  cursor: string
  pendingText: PendingTextInput | null
  onCommitText: (text: string) => void
  onCancelText: () => void
}

// inline text input positioned over the canvas at the click point
const InlineTextInput = ({
  pending,
  onCommit,
  onCancel,
}: {
  pending: PendingTextInput
  onCommit: (text: string) => void
  onCancel: () => void
}) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() =>
  {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const commit = useCallback(() =>
  {
    if (value.trim())
    {
      onCommit(value)
    }
    else
    {
      onCancel()
    }
  }, [onCancel, onCommit, value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) =>
    {
      if (e.key === 'Enter')
      {
        e.preventDefault()
        commit()
      }
      else if (e.key === 'Escape')
      {
        e.preventDefault()
        onCancel()
      }
    },
    [commit, onCancel]
  )

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className="absolute z-10 border-none bg-transparent outline-none"
      style={{
        left: pending.cssX,
        // offset upward by the text baseline so typed text aligns w/ fillText
        top: pending.cssY - pending.cssFontSize * 0.85,
        color: pending.color,
        fontSize: pending.cssFontSize,
        fontWeight: pending.bold ? 'bold' : 'normal',
        fontStyle: pending.italic ? 'italic' : 'normal',
        fontFamily: pending.fontFamily,
        lineHeight: 1,
        minWidth: 40,
        caretColor: pending.color,
      }}
      autoComplete="off"
      spellCheck={false}
    />
  )
}

export const AnnotationCanvas = memo(
  ({
    canvasRef,
    backgroundImage,
    captureTouchGestures,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onClick,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    cursor,
    pendingText,
    onCommitText,
    onCancelText,
  }: AnnotationCanvasProps) =>
  {
    const handleBackgroundLoad = useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) =>
      {
        const img = event.currentTarget
        const canvas = canvasRef.current
        if (canvas)
        {
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
        }
      },
      [canvasRef]
    )

    return (
      <div className="relative inline-block max-h-full max-w-full overflow-auto">
        <img
          src={backgroundImage}
          alt="Board export"
          onLoad={handleBackgroundLoad}
          className="block max-h-[70vh] max-w-full"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{
            cursor,
            touchAction: captureTouchGestures ? 'none' : 'auto',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onClick={onClick}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        {pendingText && (
          <InlineTextInput
            pending={pendingText}
            onCommit={onCommitText}
            onCancel={onCancelText}
          />
        )}
      </div>
    )
  }
)
