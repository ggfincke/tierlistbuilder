// src/features/workspace/annotation/ui/AnnotationEditor.tsx
// full-screen annotation editor — draw on top of an exported board image

import { useId } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { useAnnotationCanvas } from '~/features/workspace/annotation/model/useAnnotationCanvas'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { AnnotationCanvas } from './AnnotationCanvas'
import { AnnotationToolbar } from './AnnotationToolbar'

interface AnnotationEditorProps
{
  open: boolean
  onClose: () => void
  backgroundImage: string | null
}

export const AnnotationEditor = ({
  open,
  onClose,
  backgroundImage,
}: AnnotationEditorProps) =>
{
  const titleId = useId()
  const title = useActiveBoardStore((s) => s.title)
  const {
    canvasRef,
    activeTool,
    setActiveTool,
    color,
    setColor,
    strokeWidth,
    setStrokeWidth,
    fontSize,
    setFontSize,
    textStyle,
    setTextStyle,
    history,
    pendingText,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleCanvasClick,
    commitText,
    cancelText,
    undo,
    clearAll,
    compositeAndDownload,
  } = useAnnotationCanvas(backgroundImage, title)

  if (!backgroundImage) return null

  const cursor = activeTool === 'pen' ? 'crosshair' : 'text'

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex h-[min(95vh,60rem)] w-full max-w-5xl flex-col p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
          Annotate Export
        </h2>
        <div className="flex items-center gap-2">
          <SecondaryButton size="sm" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <SecondaryButton
            size="sm"
            variant="surface"
            className="font-medium"
            onClick={() =>
            {
              void compositeAndDownload()
              onClose()
            }}
          >
            Save &amp; Download
          </SecondaryButton>
        </div>
      </div>

      <AnnotationToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        color={color}
        onColorChange={setColor}
        strokeWidth={strokeWidth}
        onStrokeWidthChange={setStrokeWidth}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        textStyle={textStyle}
        onTextStyleChange={setTextStyle}
        canUndo={history.length > 0}
        onUndo={undo}
        onClear={clearAll}
      />

      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-[var(--t-border)] bg-black/30">
        <AnnotationCanvas
          canvasRef={canvasRef}
          backgroundImage={backgroundImage}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onClick={handleCanvasClick}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          cursor={cursor}
          pendingText={pendingText}
          onCommitText={commitText}
          onCancelText={cancelText}
        />
      </div>
    </BaseModal>
  )
}
