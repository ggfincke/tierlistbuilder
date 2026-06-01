// src/features/workspace/image-editor/model/labels/usePaneLabelEditor.ts
// label draft, placement, & preview state for the image editor pane

import { useCallback, useMemo, useRef, useState } from 'react'

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
  GlobalLabelDefaults,
  ItemLabelOptions,
  LabelOverlayPlacement,
  LabelPlacement,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import {
  resolveLabelLayout,
  type ResolvedLabelDisplay,
} from '~/shared/board-ui/labelDisplay'
import { CANVAS_BOUND } from '~/features/workspace/image-editor/lib/imageEditorGeometry'
import { LABEL_FONT_LABELS } from '~/features/workspace/image-editor/lib/labelEditorOptions'

interface UsePaneLabelEditorInput
{
  item: TierItem
  boardAspectRatio: number
  boardLabels: BoardLabelSettings | undefined
  globalLabelDefaults: GlobalLabelDefaults
  globalTextStyleId: TextStyleId
  boardItemSize: ItemSize
  onLabelChange: (label: string) => void
  onLabelOptionsChange: (options: ItemLabelOptions | null) => void
}

const EMPTY_LABEL_DRAG_SNAP = { x: false, y: false } as const

interface LabelDraftState
{
  committedLabel: string
  value: string
}

export const usePaneLabelEditor = ({
  item,
  boardAspectRatio,
  boardLabels,
  globalLabelDefaults,
  globalTextStyleId,
  boardItemSize,
  onLabelChange,
  onLabelOptionsChange,
}: UsePaneLabelEditorInput) =>
{
  const labelLayout = useMemo(
    () =>
      resolveLabelLayout({
        itemOptions: item.labelOptions,
        boardSettings: boardLabels,
        globalLabelDefaults,
      }),
    [item.labelOptions, boardLabels, globalLabelDefaults]
  )
  const previewLabelText = item.label?.trim() ?? ''
  const showLivePreview = labelLayout.visible && previewLabelText.length > 0
  const committedLabel = item.label ?? ''
  const [labelDraftState, setLabelDraftState] = useState<LabelDraftState>(
    () => ({
      committedLabel,
      value: committedLabel,
    })
  )
  const labelDraft =
    labelDraftState.committedLabel === committedLabel
      ? labelDraftState.value
      : committedLabel

  const updateLabelDraft = useCallback(
    (value: string) =>
    {
      setLabelDraftState({ committedLabel, value })
    },
    [committedLabel]
  )

  const commitLabel = useCallback(() =>
  {
    onLabelChange(labelDraft)
  }, [labelDraft, onLabelChange])

  const updateLabelOption = useCallback(
    <K extends keyof ItemLabelOptions>(
      key: K,
      value: ItemLabelOptions[K] | undefined
    ) =>
    {
      const current = item.labelOptions ?? {}
      const next: ItemLabelOptions = { ...current }
      if (value === undefined)
      {
        delete next[key]
      }
      else
      {
        next[key] = value
      }
      onLabelOptionsChange(Object.keys(next).length > 0 ? next : null)
    },
    [item.labelOptions, onLabelOptionsChange]
  )

  const [placementDraft, setPlacementDraft] =
    useState<LabelOverlayPlacement | null>(null)
  const placementDraftRef = useRef<LabelOverlayPlacement | null>(null)
  const [labelDragSnap, setLabelDragSnap] = useState<{
    x: boolean
    y: boolean
  }>(EMPTY_LABEL_DRAG_SNAP)

  const handleLabelDragMove = useCallback(
    (x: number, y: number, snap: { x: boolean; y: boolean }) =>
    {
      const nextDraft: LabelOverlayPlacement = { mode: 'overlay', x, y }
      placementDraftRef.current = nextDraft
      setPlacementDraft((prev) =>
        prev?.mode === 'overlay' && prev.x === x && prev.y === y
          ? prev
          : nextDraft
      )
      setLabelDragSnap((prev) =>
        prev.x === snap.x && prev.y === snap.y ? prev : snap
      )
    },
    []
  )

  const handleLabelDragEnd = useCallback(() =>
  {
    const draft = placementDraftRef.current
    setLabelDragSnap(EMPTY_LABEL_DRAG_SNAP)
    if (!draft) return
    updateLabelOption('placement', draft)
    placementDraftRef.current = null
    setPlacementDraft(null)
  }, [updateLabelOption])

  const handlePlacementChange = useCallback(
    (placement: LabelPlacement) =>
    {
      placementDraftRef.current = null
      setPlacementDraft(null)
      updateLabelOption('placement', placement)
    },
    [updateLabelOption]
  )

  const resolvedPlacement: LabelPlacement =
    placementDraft ?? labelLayout.placement
  const captionPreviewMode =
    showLivePreview &&
    (resolvedPlacement.mode === 'captionAbove' ||
      resolvedPlacement.mode === 'captionBelow')
  const previewW =
    boardAspectRatio >= 1 ? CANVAS_BOUND : CANVAS_BOUND * boardAspectRatio
  const previewH =
    boardAspectRatio >= 1 ? CANVAS_BOUND / boardAspectRatio : CANVAS_BOUND
  const previewTileSize = itemSlotDimensions(boardItemSize, boardAspectRatio)
  const previewScale =
    previewTileSize.height > 0 ? previewH / previewTileSize.height : 1
  const previewLabelDisplay = useMemo<ResolvedLabelDisplay>(
    () => ({
      placement: resolvedPlacement,
      scrim: labelLayout.scrim,
      fontSizePx: labelLayout.fontSizePx * previewScale,
      textStyleId: labelLayout.textStyleId,
      textColor: labelLayout.textColor,
      text: previewLabelText,
    }),
    [
      resolvedPlacement,
      labelLayout.scrim,
      labelLayout.fontSizePx,
      labelLayout.textStyleId,
      labelLayout.textColor,
      previewScale,
      previewLabelText,
    ]
  )

  return {
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
    inheritedTextStyleLabel:
      LABEL_FONT_LABELS[boardLabels?.textStyleId ?? globalTextStyleId],
    boardDefaultVisible: boardLabels?.show ?? globalLabelDefaults.showLabels,
  }
}
