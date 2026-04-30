// src/features/workspace/imageEditor/model/usePaneLabelEditor.ts
// label draft, placement, & preview state for the image editor pane

import { useCallback, useMemo, useRef, useState } from 'react'

import type { TextStyleId } from '@tierlistbuilder/contracts/lib/theme'
import type {
  BoardLabelSettings,
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
import { CANVAS_BOUND } from '../lib/imageEditorGeometry'
import { LABEL_FONT_LABELS } from '../lib/labelEditorOptions'

interface UsePaneLabelEditorInput
{
  item: TierItem
  boardAspectRatio: number
  boardLabels: BoardLabelSettings | undefined
  globalShowLabels: boolean
  globalTextStyleId: TextStyleId
  boardItemSize: ItemSize
  onLabelChange: (label: string) => void
  onLabelOptionsChange: (options: ItemLabelOptions | null) => void
}

const EMPTY_LABEL_DRAG_SNAP = { x: false, y: false } as const

interface LabelDraftState
{
  itemId: TierItem['id']
  committedLabel: string
  value: string
}

interface PlacementDraftState
{
  itemId: TierItem['id']
  draft: LabelOverlayPlacement | null
}

interface LabelDragSnapState
{
  itemId: TierItem['id']
  snap: { x: boolean; y: boolean }
}

export const usePaneLabelEditor = ({
  item,
  boardAspectRatio,
  boardLabels,
  globalShowLabels,
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
        globalShowLabels,
      }),
    [item.labelOptions, boardLabels, globalShowLabels]
  )
  const previewLabelText = item.label?.trim() ?? ''
  const showLivePreview = labelLayout.visible && previewLabelText.length > 0
  const committedLabel = item.label ?? ''
  const [labelDraftState, setLabelDraftState] = useState<LabelDraftState>(
    () => ({
      itemId: item.id,
      committedLabel,
      value: committedLabel,
    })
  )
  const labelDraft =
    labelDraftState.itemId === item.id &&
    labelDraftState.committedLabel === committedLabel
      ? labelDraftState.value
      : committedLabel

  const updateLabelDraft = useCallback(
    (value: string) =>
    {
      setLabelDraftState({ itemId: item.id, committedLabel, value })
    },
    [committedLabel, item.id]
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

  const handleFontSizePxChange = useCallback(
    (px: number | undefined) =>
    {
      const current = item.labelOptions ?? {}
      const next: ItemLabelOptions = { ...current }
      if (px === undefined) delete next.fontSizePx
      else next.fontSizePx = px
      onLabelOptionsChange(Object.keys(next).length > 0 ? next : null)
    },
    [item.labelOptions, onLabelOptionsChange]
  )

  const [placementDraftState, setPlacementDraftState] =
    useState<PlacementDraftState>(() => ({ itemId: item.id, draft: null }))
  const placementDraft =
    placementDraftState.itemId === item.id ? placementDraftState.draft : null
  const placementDraftRef = useRef<PlacementDraftState>({
    itemId: item.id,
    draft: null,
  })
  const [labelDragSnapState, setLabelDragSnapState] =
    useState<LabelDragSnapState>(() => ({
      itemId: item.id,
      snap: EMPTY_LABEL_DRAG_SNAP,
    }))
  const labelDragSnap =
    labelDragSnapState.itemId === item.id
      ? labelDragSnapState.snap
      : EMPTY_LABEL_DRAG_SNAP

  const handleLabelDragMove = useCallback(
    (x: number, y: number, snap: { x: boolean; y: boolean }) =>
    {
      const nextDraft: LabelOverlayPlacement = { mode: 'overlay', x, y }
      placementDraftRef.current = { itemId: item.id, draft: nextDraft }
      setPlacementDraftState({ itemId: item.id, draft: nextDraft })
      setLabelDragSnapState((prev) =>
        prev.itemId === item.id &&
        prev.snap.x === snap.x &&
        prev.snap.y === snap.y
          ? prev
          : { itemId: item.id, snap }
      )
    },
    [item.id]
  )

  const handleLabelDragEnd = useCallback(() =>
  {
    const { itemId, draft } = placementDraftRef.current
    setLabelDragSnapState({ itemId: item.id, snap: EMPTY_LABEL_DRAG_SNAP })
    if (!draft || itemId !== item.id) return
    updateLabelOption('placement', draft)
    placementDraftRef.current = { itemId: item.id, draft: null }
    setPlacementDraftState({ itemId: item.id, draft: null })
  }, [item.id, updateLabelOption])

  const handlePlacementChange = useCallback(
    (placement: LabelPlacement) =>
    {
      placementDraftRef.current = { itemId: item.id, draft: null }
      setPlacementDraftState({ itemId: item.id, draft: null })
      updateLabelOption('placement', placement)
    },
    [item.id, updateLabelOption]
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
    inheritedTextStyleLabel:
      LABEL_FONT_LABELS[boardLabels?.textStyleId ?? globalTextStyleId],
    boardDefaultVisible: boardLabels?.show ?? globalShowLabels,
  }
}
