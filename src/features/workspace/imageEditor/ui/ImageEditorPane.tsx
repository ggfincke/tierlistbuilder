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
  BoardAutoPlateSettings,
  BoardLabelSettings,
  GlobalLabelDefaults,
  ImageFit,
  ItemLabelOptions,
  ItemTransform,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import {
  getEffectiveImageFit,
  getPaddingFrameScale,
} from '~/shared/board-ui/aspectRatio'
import { resolveItemBackdrop } from '~/shared/board-ui/mediaPlate'
import { OBJECT_FIT_CLASS } from '~/shared/board-ui/constants'
import { useImageUrlChain } from '~/shared/hooks/useImageUrl'
import { getImageRenditionRefs } from '~/shared/lib/imageRefs'
import { buildManualCropImgStyle } from '~/shared/lib/imageTransform'
import { useMeasuredElementSize } from '~/features/workspace/imageEditor/lib/useMeasuredElementSize'
import type { PendingImageEditorPaneEdit } from '~/features/workspace/imageEditor/model/pendingImageEdit'
import type { ImageEditorMode } from '~/features/workspace/imageEditor/model/useImageEditorStore'
import { useArrowKeyNudge } from '~/features/workspace/imageEditor/model/transform/useArrowKeyNudge'
import { useImageEditorAutoCropItem } from '~/features/workspace/imageEditor/model/auto-crop/useImageEditorAutoCropItem'
import { useImageEditorPaddingDraft } from '~/features/workspace/imageEditor/model/transform/useImageEditorPaddingDraft'
import { useImageEditorTransformDraft } from '~/features/workspace/imageEditor/model/transform/useImageEditorTransformDraft'
import { usePanGesture } from '~/features/workspace/imageEditor/model/transform/usePanGesture'
import { usePaneLabelEditor } from '~/features/workspace/imageEditor/model/labels/usePaneLabelEditor'
import { useWheelZoom } from '~/features/workspace/imageEditor/model/transform/useWheelZoom'
import {
  ImageEditorMetadataPanel,
  type ImageEditorMetadataPanelHandle,
} from '~/features/workspace/imageEditor/ui/ImageEditorMetadataPanel'
import { ImageEditorPaneFooter } from '~/features/workspace/imageEditor/ui/ImageEditorPaneFooter'
import { ImageEditorPaneHeader } from '~/features/workspace/imageEditor/ui/ImageEditorPaneHeader'
import { ImageEditorPreviewCanvas } from '~/features/workspace/imageEditor/ui/ImageEditorPreviewCanvas'
import { LabelEditorRow } from '~/features/workspace/imageEditor/ui/LabelEditorRow'
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
  boardDefaultPadding: number | undefined
  boardAutoPlate: BoardAutoPlateSettings | undefined
  trimSoftShadows: boolean
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  globalTextStyleId: TextStyleId
  boardItemSize: ItemSize
  getBoardAspectRatioForItem: (item: TierItem) => number
  onCommit: (transform: ItemTransform | null) => void
  onPaddingCommit: (padding: number | null) => void
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
    boardDefaultPadding,
    boardAutoPlate,
    trimSoftShadows,
    boardLabels,
    globalLabelDefaults,
    globalTextStyleId,
    boardItemSize,
    getBoardAspectRatioForItem,
    onCommit,
    onPaddingCommit,
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
  const autoCropAspectRatio = getBoardAspectRatioForItem(item)
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
  const hasPlate = resolveItemBackdrop(item, boardAutoPlate) != null
  const {
    workingPadding,
    setPaddingLive,
    resetPadding,
    hasPaddingChanges,
    flushPendingPadding,
  } = useImageEditorPaddingDraft({
    item,
    boardDefaultPadding,
    hasPlate,
    onCommit: onPaddingCommit,
  })
  // gestures normalize pointer deltas by the image frame — which is inset by
  // the padding — so pan/nudge stay 1:1 w/ the cursor at any padding
  const paddingScale = getPaddingFrameScale(workingPadding)
  const innerCanvasW = canvasW * paddingScale
  const innerCanvasH = canvasH * paddingScale
  const { status: autoCropStatus, autoCrop } = useImageEditorAutoCropItem({
    item,
    trimSoftShadows,
    autoCropAspectRatio,
    working,
    setWorkingDraft,
  })
  const { isDragging, onPointerDown, onPointerEnd, onPointerMove, snap } =
    usePanGesture({
      canvasHeight: innerCanvasH,
      canvasWidth: innerCanvasW,
      enabled: !!url,
      frameAspectRatio,
      intrinsicAspectRatio: item.aspectRatio,
      setWorkingDraft,
      working,
    })
  useArrowKeyNudge({
    canvasHeight: innerCanvasH,
    canvasWidth: innerCanvasW,
    enabled: !!url,
    setWorkingDraft,
  })
  useWheelZoom({
    canvasRef,
    enabled: !!url,
    getFitBaselineZoom,
    padding: workingPadding,
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
        flushPendingPadding()
      },
    }),
    [flushPendingPadding, flushPendingTransform, getPendingTransformEdit]
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
        padding={workingPadding}
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
          onFontSizePxChange={(px) => updateLabelOption('fontSizePx', px)}
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
          mediaPlate={item.mediaPlate}
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
            displayPadding: workingPadding,
            onPaddingLiveChange: setPaddingLive,
            centerOffsets,
            working,
            autoCrop,
            autoCropStatus,
            reset: () =>
            {
              reset()
              resetPadding()
            },
            hasChanges: hasChanges || hasPaddingChanges,
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
