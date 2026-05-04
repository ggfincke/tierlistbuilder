// src/features/workspace/imageEditor/ui/ImageEditorPreviewCanvas.tsx
// preview frame, crop image, snap guides, & draggable label overlay

import type { CSSProperties, PointerEventHandler, RefObject } from 'react'

import type {
  LabelOverlayPlacement,
  LabelPlacement,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { CaptionStrip as SharedCaptionStrip } from '~/shared/board-ui/labelBlocks'
import { DraggableLabelOverlay } from './DraggableLabelOverlay'

interface ImageEditorPreviewCanvasProps
{
  item: TierItem
  url: string | null
  previewW: number
  previewH: number
  canvasRef: RefObject<HTMLDivElement | null>
  captionPreviewMode: boolean
  resolvedPlacement: LabelPlacement
  previewLabelDisplay: ResolvedLabelDisplay
  imgClass: string
  imgStyle: CSSProperties
  isDragging: boolean
  snap: { x: boolean; y: boolean }
  placementDraft: LabelOverlayPlacement | null
  labelDragSnap: { x: boolean; y: boolean }
  showLivePreview: boolean
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerEnd: PointerEventHandler<HTMLDivElement>
  onLabelDragMove: (
    x: number,
    y: number,
    snap: { x: boolean; y: boolean }
  ) => void
  onLabelDragEnd: () => void
}

export const ImageEditorPreviewCanvas = ({
  item,
  url,
  previewW,
  previewH,
  canvasRef,
  captionPreviewMode,
  resolvedPlacement,
  previewLabelDisplay,
  imgClass,
  imgStyle,
  isDragging,
  snap,
  placementDraft,
  labelDragSnap,
  showLivePreview,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onLabelDragMove,
  onLabelDragEnd,
}: ImageEditorPreviewCanvasProps) => (
  <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--t-bg-sunken)] p-6">
    <div
      className={`overflow-hidden rounded border border-[var(--t-border-secondary)] bg-black/20 select-none ${
        captionPreviewMode ? 'flex flex-col' : ''
      }`}
      style={{
        width: previewW,
        height: previewH,
      }}
    >
      {captionPreviewMode && resolvedPlacement.mode === 'captionAbove' && (
        <SharedCaptionStrip display={previewLabelDisplay} />
      )}
      <div
        ref={canvasRef}
        className={`relative overflow-hidden ${
          captionPreviewMode ? 'min-h-0 flex-1' : 'h-full w-full'
        }`}
        style={{
          cursor: isDragging ? 'grabbing' : url ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        role="presentation"
      >
        {url ? (
          <img
            src={url}
            alt={item.altText ?? item.label ?? 'Tier item'}
            className={imgClass}
            style={imgStyle}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[var(--t-text-faint)]">
            Loading...
          </div>
        )}
        {snap.x && <SnapGuide axis="x" />}
        {snap.y && <SnapGuide axis="y" />}
        {placementDraft && labelDragSnap.x && <SnapGuide axis="x" />}
        {placementDraft && labelDragSnap.y && <SnapGuide axis="y" />}
        {showLivePreview && resolvedPlacement.mode === 'overlay' && (
          <DraggableLabelOverlay
            display={previewLabelDisplay}
            canvasRef={canvasRef}
            onDragMove={onLabelDragMove}
            onDragEnd={onLabelDragEnd}
          />
        )}
      </div>
      {captionPreviewMode && resolvedPlacement.mode === 'captionBelow' && (
        <SharedCaptionStrip display={previewLabelDisplay} />
      )}
    </div>
  </div>
)

interface SnapGuideProps
{
  axis: 'x' | 'y'
}

const SnapGuide = ({ axis }: SnapGuideProps) => (
  <div
    aria-hidden="true"
    className={
      axis === 'x'
        ? 'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--t-accent)]'
        : 'pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--t-accent)]'
    }
  />
)
