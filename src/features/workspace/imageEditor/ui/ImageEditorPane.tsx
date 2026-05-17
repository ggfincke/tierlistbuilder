// src/features/workspace/imageEditor/ui/ImageEditorPane.tsx
// active item editor pane for image transforms, captions, & navigation

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ImageFit,
  ItemLabelOptions,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import { getEffectiveImageFit } from '~/shared/board-ui/aspectRatio'
import { OBJECT_FIT_CLASS } from '~/shared/board-ui/constants'
import { useImageUrlChain } from '~/shared/hooks/useImageUrl'
import { getImageRenditionRefs } from '~/shared/lib/imageRefs'
import { buildManualCropImgStyle } from '~/shared/lib/imageTransform'
import { useMeasuredElementSize } from '../lib/useMeasuredElementSize'
import type { PendingImageEditorPaneEdit } from '../model/pendingImageEdit'
import type { ImageEditorMode } from '../model/useImageEditorStore'
import { useArrowKeyNudge } from '../model/useArrowKeyNudge'
import { useImageEditorAutoCropItem } from '../model/useImageEditorAutoCropItem'
import { useImageEditorTransformDraft } from '../model/useImageEditorTransformDraft'
import { usePanGesture } from '../model/usePanGesture'
import { usePaneLabelEditor } from '../model/usePaneLabelEditor'
import { useWheelZoom } from '../model/useWheelZoom'
import {
  ImageEditorMetadataPanel,
  type ImageEditorMetadataPanelHandle,
} from './ImageEditorMetadataPanel'
import { ImageEditorPaneFooter } from './ImageEditorPaneFooter'
import { ImageEditorPaneHeader } from './ImageEditorPaneHeader'
import { ImageEditorPreviewCanvas } from './ImageEditorPreviewCanvas'
import { LabelEditorRow } from './LabelEditorRow'
import { hasAnyImageRef } from '~/shared/lib/imageRefs'

export interface ImageEditorPaneHandle
{
  getPendingEdit: () => PendingImageEditorPaneEdit | null
  flushPendingEdit: () => void
}

interface ImageEditorPaneProps
{
  item: TierItem
  mode: ImageEditorMode
  boardAspectRatio: number
  boardDefaultFit: ImageFit | undefined
  trimSoftShadows: boolean
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  globalTextStyleId: TextStyleId
  boardItemSize: ItemSize
  onCommit: (transform: ItemTransform | null) => void
  onLabelChange: (label: string) => void
  onLabelOptionsChange: (options: ItemLabelOptions | null) => void
  onApplyLabelToAll: () => void
  canApplyLabelToAll: boolean
  labelAppliedToAll: boolean
  applyLabelToAllTitle: string
  captionExpanded: boolean
  onCaptionExpandedChange: (expanded: boolean) => void
  imageExpanded: boolean
  onImageExpandedChange: (expanded: boolean) => void
  // single-mode-only callbacks; multi-mode passes no-ops & hides the panel
  onAltTextChange: (value: string) => void
  onNotesChange: (value: string) => void
  onBackgroundColorChange: (value: string | null) => void
  canPrev: boolean
  canNext: boolean
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
  canSkip: boolean
}

const STATIC_IMG_STYLE = { pointerEvents: 'none' as const }

export const ImageEditorPane = forwardRef<
  ImageEditorPaneHandle,
  ImageEditorPaneProps
>(function ImageEditorPane(
  {
    item,
    mode,
    boardAspectRatio,
    boardDefaultFit,
    trimSoftShadows,
    boardLabels,
    globalLabelDefaults,
    globalTextStyleId,
    boardItemSize,
    onCommit,
    onLabelChange,
    onLabelOptionsChange,
    onApplyLabelToAll,
    canApplyLabelToAll,
    labelAppliedToAll,
    applyLabelToAllTitle,
    captionExpanded,
    onCaptionExpandedChange,
    imageExpanded,
    onImageExpandedChange,
    onAltTextChange,
    onNotesChange,
    onBackgroundColorChange,
    canPrev,
    canNext,
    onPrev,
    onNext,
    onSkip,
    canSkip,
  }: ImageEditorPaneProps,
  ref
)
{
  const imageSectionId = useId()
  const { imageRef: previewImageRef, sourceImageRef, tileImageRef } = item
  const hasImage = hasAnyImageRef(item)
  const editorImageSources = useMemo(
    () =>
      getImageRenditionRefs(
        { imageRef: previewImageRef, sourceImageRef, tileImageRef },
        'editor'
      ).map(({ ref, variant }) => ({
        hash: ref.hash,
        cloudMediaExternalId: ref.cloudMediaExternalId,
        variant,
      })),
    [previewImageRef, sourceImageRef, tileImageRef]
  )
  const url = useImageUrlChain(editorImageSources)
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const {
    labelDraft,
    updateLabelDraft,
    commitLabel,
    updateLabelOption,
    handleFontSizePxChange,
    placementDraft,
    labelDragSnap,
    handleLabelDragMove,
    handleLabelDragEnd,
    handlePlacementChange,
    resolvedPlacement,
    captionPreviewMode,
    previewW,
    previewH,
    previewLabelDisplay,
    showLivePreview,
    labelLayout,
    inheritedTextStyleLabel,
    boardDefaultVisible,
  } = usePaneLabelEditor({
    item,
    boardAspectRatio,
    boardLabels,
    globalLabelDefaults,
    globalTextStyleId,
    boardItemSize,
    onLabelChange,
    onLabelOptionsChange,
  })
  const canvasSize = useMeasuredElementSize(canvasRef, {
    width: previewW,
    height: previewH,
  })
  const canvasW = canvasSize.width
  const canvasH = canvasSize.height
  const frameAspectRatio =
    canvasW > 0 && canvasH > 0 ? canvasW / canvasH : boardAspectRatio
  const {
    working,
    setWorkingDraft,
    isDirty,
    savedFlash,
    hasChanges,
    displayZoom,
    displayZoomMin,
    displaySliderZoomMax,
    getFitBaselineZoom,
    getPendingTransformEdit,
    flushPendingTransform,
    rotate,
    setZoomLive,
    reset,
    centerOffsets,
  } = useImageEditorTransformDraft({
    item,
    frameAspectRatio,
    effectiveFit,
    onCommit,
  })
  const { status: autoCropStatus, autoCrop } = useImageEditorAutoCropItem({
    item,
    trimSoftShadows,
    frameAspectRatio,
    working,
    setWorkingDraft,
  })
  const { isDragging, onPointerDown, onPointerEnd, onPointerMove, snap } =
    usePanGesture({
      canvasHeight: canvasH,
      canvasWidth: canvasW,
      enabled: !!url,
      frameAspectRatio,
      intrinsicAspectRatio: item.aspectRatio,
      setWorkingDraft,
      working,
    })
  useArrowKeyNudge({
    canvasHeight: canvasH,
    canvasWidth: canvasW,
    enabled: !!url,
    setWorkingDraft,
  })
  useWheelZoom({
    canvasRef,
    enabled: !!url,
    getFitBaselineZoom,
    setWorkingDraft,
  })
  const commitLabelRef = useRef(commitLabel)
  const metadataPanelRef = useRef<ImageEditorMetadataPanelHandle | null>(null)

  useEffect(() =>
  {
    commitLabelRef.current = commitLabel
  }, [commitLabel])

  useImperativeHandle(
    ref,
    () => ({
      getPendingEdit: getPendingTransformEdit,
      flushPendingEdit: () =>
      {
        commitLabelRef.current()
        metadataPanelRef.current?.flushDrafts()
        flushPendingTransform()
      },
    }),
    [flushPendingTransform, getPendingTransformEdit]
  )

  useEffect(
    () => () =>
    {
      commitLabelRef.current()
    },
    []
  )

  const useManualCrop =
    hasImage && (hasChanges || effectiveFit === 'cover' || !!item.aspectRatio)
  const imgClass = useManualCrop
    ? 'absolute max-w-none select-none'
    : `h-full w-full ${OBJECT_FIT_CLASS[effectiveFit]}`
  const imgStyle = useMemo(
    () =>
      useManualCrop
        ? buildManualCropImgStyle(working, {
            intrinsicAspect: item.aspectRatio,
            frameAspect: frameAspectRatio,
            willChangeTransform: true,
            pointerEventsNone: true,
          })
        : STATIC_IMG_STYLE,
    [useManualCrop, working, item.aspectRatio, frameAspectRatio]
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ImageEditorPaneHeader
        autoCrop={autoCrop}
        autoCropStatus={autoCropStatus}
        boardAspectRatio={boardAspectRatio}
        hasImage={hasImage}
        isDirty={isDirty}
        item={item}
        labelDraft={labelDraft}
        onCommitLabel={commitLabel}
        onLabelDraftChange={updateLabelDraft}
        savedFlash={savedFlash}
      />
      <ImageEditorPreviewCanvas
        item={item}
        url={url}
        hasImage={hasImage}
        previewW={previewW}
        previewH={previewH}
        canvasRef={canvasRef}
        captionPreviewMode={captionPreviewMode}
        resolvedPlacement={resolvedPlacement}
        previewLabelDisplay={previewLabelDisplay}
        imgClass={imgClass}
        imgStyle={imgStyle}
        isDragging={isDragging}
        snap={snap}
        placementDraft={placementDraft}
        labelDragSnap={labelDragSnap}
        showLivePreview={showLivePreview}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerEnd={onPointerEnd}
        onLabelDragMove={handleLabelDragMove}
        onLabelDragEnd={handleLabelDragEnd}
      />
      {hasImage && (
        <LabelEditorRow
          resolvedPlacement={resolvedPlacement}
          resolvedScrim={labelLayout.scrim}
          resolvedTextColor={labelLayout.textColor}
          resolvedFontSizePx={labelLayout.fontSizePx}
          resolvedTextStyleId={labelLayout.textStyleId}
          inheritedTextStyleLabel={inheritedTextStyleLabel}
          boardDefaultVisible={boardDefaultVisible}
          itemOptions={item.labelOptions}
          onPlacementChange={handlePlacementChange}
          onScrimChange={(s) => updateLabelOption('scrim', s)}
          onTextColorChange={(c) => updateLabelOption('textColor', c)}
          onFontSizePxChange={handleFontSizePxChange}
          onTextStyleChange={(t) => updateLabelOption('textStyleId', t)}
          onVisibleChange={(v) => updateLabelOption('visible', v)}
          onClearOverrides={() => onLabelOptionsChange(null)}
          onApplyToAll={onApplyLabelToAll}
          canApplyToAll={canApplyLabelToAll}
          appliedToAll={labelAppliedToAll}
          applyToAllTitle={applyLabelToAllTitle}
          expanded={captionExpanded}
          onExpandedChange={onCaptionExpandedChange}
        />
      )}
      {mode === 'single' && (
        <ImageEditorMetadataPanel
          ref={metadataPanelRef}
          itemId={item.id}
          altText={item.altText}
          notes={item.notes}
          backgroundColor={item.backgroundColor}
          hasImage={hasImage}
          onAltTextChange={onAltTextChange}
          onNotesChange={onNotesChange}
          onBackgroundColorChange={onBackgroundColorChange}
        />
      )}
      {hasImage && (
        <ImageEditorPaneFooter
          expansion={{
            imageSectionId,
            imageExpanded,
            onImageExpandedChange,
          }}
          transform={{
            rotate,
            displayZoom,
            displayZoomMin,
            displaySliderZoomMax,
            onZoomLiveChange: setZoomLive,
            centerOffsets,
            working,
            autoCrop,
            autoCropStatus,
            reset,
            hasChanges,
            isDirty,
          }}
          navigation={{
            canPrev,
            canNext,
            canSkip,
            onPrev,
            onNext,
            onSkip,
          }}
        />
      )}
    </div>
  )
})
