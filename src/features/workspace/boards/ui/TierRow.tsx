// src/features/workspace/boards/ui/TierRow.tsx
// tier row component — label, sortable item grid, & row controls

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

import {
  createCustomTierColorSpec,
  getPaletteColors,
  resolveTierColorSpec,
} from '@/shared/theme/tierColors'
import { useCurrentPaletteId } from '@/features/workspace/settings/model/useCurrentPaletteId'
import type { Tier } from '@/features/workspace/boards/model/contract'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { ITEM_SIZE_PX } from '@/shared/board-ui/constants'
import { CUSTOM_COLOR_PICKER_WIDTH_PX } from '@/shared/overlay/uiMeasurements'
import {
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
} from '@/shared/overlay/popupPosition'
import { useAnchoredPopup } from '@/shared/overlay/useAnchoredPopup'
import {
  BoardItemsGrid,
  BoardRowContent,
  BoardRowSurface,
} from '@/shared/board-ui/BoardPrimitives'
import { TierItem } from './TierItem'
import { TierLabel } from './TierLabel'
import { TierRowSettingsMenu } from './TierRowSettingsMenu'
import { ColorPicker, CustomColorPicker } from './ColorPicker'
import { OverlayFixedPopupSurface } from '@/shared/overlay/OverlayPrimitives'

interface TierRowProps
{
  tier: Tier
  index: number
  totalTiers: number
}

export const TierRow = ({ tier, index, totalTiers }: TierRowProps) =>
{
  const reorderTier = useActiveBoardStore((state) => state.reorderTier)
  const recolorTier = useActiveBoardStore((state) => state.recolorTier)

  const itemSize = useSettingsStore((state) => state.itemSize)
  const compactMode = useSettingsStore((state) => state.compactMode)
  const boardLocked = useSettingsStore((state) => state.boardLocked)
  const hideRowControls = useSettingsStore((state) => state.hideRowControls)
  const paletteId = useCurrentPaletteId()
  const sizePx = ITEM_SIZE_PX[itemSize]
  const paletteColors = getPaletteColors(paletteId)
  const resolvedTierColor = resolveTierColorSpec(paletteId, tier.colorSpec)

  // tier-level sortable — drag handle on the grip icon reorders entire rows
  const {
    attributes: tierAttributes,
    listeners: tierListeners,
    setNodeRef: setTierSortableRef,
    transform: tierTransform,
    transition: tierTransition,
    isDragging: isTierDragging,
  } = useSortable({
    id: tier.id,
    disabled: boardLocked || hideRowControls,
    data: { type: 'tier' },
  })

  const tierStyle = {
    transform: CSS.Transform.toString(tierTransform),
    transition: tierTransition,
    opacity: isTierDragging ? 0.4 : 1,
  }

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [previewColor, setPreviewColor] = useState<string | null>(null)

  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const customColorButtonRef = useRef<HTMLButtonElement>(null)
  const customColorPickerRef = useRef<HTMLDivElement>(null)
  const colorPickerIgnoreRefs = useMemo(() => [customColorPickerRef], [])
  const customColorPickerIgnoreRefs = useMemo(() => [colorPickerRef], [])

  // close both color popups together when the tray is dismissed
  const closeColorPickers = useCallback(() =>
  {
    setShowCustomColorPicker(false)
    setShowColorPicker(false)
    setPreviewColor(null)
  }, [])

  // close only the custom popup so the swatch tray stays open
  const closeCustomColorPicker = useCallback(() =>
  {
    setShowCustomColorPicker(false)
    setPreviewColor(null)
  }, [])

  const { style: colorPickerStyle } = useAnchoredPopup({
    open: showColorPicker,
    triggerRef: colorButtonRef,
    popupRef: colorPickerRef,
    ignoreRefs: colorPickerIgnoreRefs,
    onClose: closeColorPickers,
    closeOnEscape: false,
    computePosition: () =>
      colorButtonRef.current
        ? computeColorPickerStyle(colorButtonRef.current)
        : null,
  })

  const {
    style: customColorPickerStyle,
    updatePosition: updateCustomColorPickerPosition,
  } = useAnchoredPopup({
    open: showCustomColorPicker,
    triggerRef: customColorButtonRef,
    popupRef: customColorPickerRef,
    ignoreRefs: customColorPickerIgnoreRefs,
    onClose: closeCustomColorPicker,
    closeOnEscape: false,
    computePosition: () =>
    {
      if (!customColorButtonRef.current)
      {
        return null
      }

      if (customColorPickerRef.current)
      {
        // single getBoundingClientRect call avoids back-to-back forced layouts
        const rect = customColorPickerRef.current.getBoundingClientRect()
        return computeCustomColorPickerStyle(
          customColorButtonRef.current,
          colorPickerRef.current,
          rect.width,
          rect.height
        )
      }

      return computeCustomColorPickerStyle(
        customColorButtonRef.current,
        colorPickerRef.current,
        CUSTOM_COLOR_PICKER_WIDTH_PX
      )
    },
  })

  const droppableData = useMemo(
    () => ({ type: 'container' as const, containerId: tier.id }),
    [tier.id]
  )
  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
    data: droppableData,
  })

  useEffect(() =>
  {
    if (
      !showCustomColorPicker ||
      !customColorButtonRef.current ||
      !customColorPickerRef.current
    )
    {
      return
    }

    // remeasure the custom popup when its content changes size
    const resizeObserver = new ResizeObserver(() =>
      updateCustomColorPickerPosition()
    )
    resizeObserver.observe(customColorPickerRef.current)

    return () => resizeObserver.disconnect()
  }, [showCustomColorPicker, updateCustomColorPickerPosition])

  useEffect(() =>
  {
    if (!showColorPicker && !showCustomColorPicker)
    {
      return
    }

    // close the child popup before the parent tray when Escape is pressed
    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.key !== 'Escape')
      {
        return
      }

      event.preventDefault()

      if (showCustomColorPicker)
      {
        setShowCustomColorPicker(false)
        return
      }

      setShowColorPicker(false)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showColorPicker, showCustomColorPicker])

  return (
    <div ref={setTierSortableRef} style={tierStyle} {...tierAttributes}>
      <BoardRowSurface className={isOver ? 'bg-[var(--t-bg-drag-over)]' : ''}>
        <BoardRowContent index={index}>
          {/* tier drag handle — grip icon on the left edge of the label */}
          {!hideRowControls && !boardLocked && (
            <button
              type="button"
              className="focus-custom flex shrink-0 cursor-grab touch-none items-center px-0.5 text-[var(--t-text-faint)] opacity-0 transition-opacity hover:text-[var(--t-text)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] group-hover:opacity-100 [div:hover>&]:opacity-100"
              aria-label="Drag to reorder tier"
              {...tierListeners}
            >
              <GripVertical className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          <TierLabel tier={tier} colorOverride={previewColor} />

          <SortableContext items={tier.itemIds} strategy={rectSortingStrategy}>
            <BoardItemsGrid
              ref={setNodeRef}
              compactMode={compactMode}
              minHeightPx={sizePx}
              data-testid={`tier-container-${tier.id}`}
              data-tier-id={tier.id}
            >
              {tier.itemIds.map((itemId) => (
                <TierItem key={itemId} itemId={itemId} containerId={tier.id} />
              ))}
            </BoardItemsGrid>
          </SortableContext>
        </BoardRowContent>

        {!hideRowControls && !boardLocked && (
          <div className="flex shrink-0 items-center gap-1 border-l border-[var(--t-border)] bg-[var(--t-bg-page)] px-1.5 max-sm:px-1">
            <div className="flex flex-col items-center justify-center gap-1">
              <button
                type="button"
                className="focus-custom rounded px-1 py-0.5 text-xs text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:opacity-30 max-sm:px-2 max-sm:py-1.5"
                disabled={index === 0}
                onClick={() => reorderTier(tier.id, 'up')}
                aria-label="Move tier up"
              >
                ▲
              </button>

              <button
                ref={colorButtonRef}
                type="button"
                className="focus-custom h-4 w-4 rounded-full border border-[var(--t-border-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-page)]"
                style={{ backgroundColor: resolvedTierColor }}
                onClick={() =>
                {
                  if (!showColorPicker)
                  {
                    setShowColorPicker(true)
                    setShowCustomColorPicker(false)
                    setShowSettingsMenu(false)
                  }
                }}
                aria-label="Change tier color"
              />

              <button
                type="button"
                className="focus-custom rounded px-1 py-0.5 text-xs text-[var(--t-text-faint)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:opacity-30 max-sm:px-2 max-sm:py-1.5"
                disabled={index === totalTiers - 1}
                onClick={() => reorderTier(tier.id, 'down')}
                aria-label="Move tier down"
              >
                ▼
              </button>
            </div>

            <TierRowSettingsMenu
              tier={tier}
              index={index}
              paletteId={paletteId}
              show={showSettingsMenu}
              onToggle={() =>
              {
                setShowSettingsMenu(true)
                setShowColorPicker(false)
                setShowCustomColorPicker(false)
              }}
              onClose={() => setShowSettingsMenu(false)}
            />
          </div>
        )}
      </BoardRowSurface>

      {showColorPicker &&
        createPortal(
          <OverlayFixedPopupSurface
            ref={colorPickerRef}
            className="z-50"
            style={colorPickerStyle}
          >
            <ColorPicker
              colorSpec={tier.colorSpec}
              colors={paletteColors}
              customTriggerRef={customColorButtonRef}
              showCustomPicker={showCustomColorPicker}
              onChange={(colorSpec) =>
              {
                recolorTier(tier.id, colorSpec)
                closeColorPickers()
              }}
              onToggleCustomPicker={() =>
              {
                setShowCustomColorPicker((current) => !current)
              }}
            />
          </OverlayFixedPopupSurface>,
          document.body
        )}

      {showCustomColorPicker &&
        createPortal(
          <OverlayFixedPopupSurface
            ref={customColorPickerRef}
            className="z-[60] shadow-2xl"
            style={{
              ...customColorPickerStyle,
              width: 'min(17.5rem, calc(100vw - 16px))',
            }}
          >
            <CustomColorPicker
              key={`${resolvedTierColor}:${tier.colorSpec.kind === 'palette' ? tier.colorSpec.index : 'custom'}`}
              value={resolvedTierColor}
              onApply={(color) =>
              {
                recolorTier(tier.id, createCustomTierColorSpec(color))
                closeColorPickers()
              }}
              onCancel={closeCustomColorPicker}
              onPreview={setPreviewColor}
            />
          </OverlayFixedPopupSurface>,
          document.body
        )}
    </div>
  )
}
