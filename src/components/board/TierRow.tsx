// src/components/board/TierRow.tsx
// tier row component — label, sortable item grid, & row controls

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

import {
  createCustomTierColorSpec,
  resolveTierColorSpec,
} from '../../domain/tierColors'
import { useCurrentPaletteId } from '../../hooks/useCurrentPaletteId'
import type { Tier } from '../../types'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { PALETTES } from '../../theme'
import { ITEM_SIZE_PX } from '../../utils/constants'
import {
  CUSTOM_COLOR_PICKER_WIDTH_PX,
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
} from '../../utils/popupPosition'
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition'
import { usePopupClose } from '../../hooks/usePopupClose'
import {
  BoardItemsGrid,
  BoardRowContent,
  BoardRowSurface,
} from './BoardPrimitives'
import { TierItem } from './TierItem'
import { TierLabel } from './TierLabel'
import { TierRowSettingsMenu } from './TierRowSettingsMenu'
import { ColorPicker, CustomColorPicker } from './ColorPicker'
import { OverlayFixedPopupSurface } from '../ui/OverlayPrimitives'

interface TierRowProps
{
  tier: Tier
  index: number
  totalTiers: number
}

export const TierRow = ({ tier, index, totalTiers }: TierRowProps) =>
{
  const reorderTier = useTierListStore((state) => state.reorderTier)
  const recolorTier = useTierListStore((state) => state.recolorTier)

  const itemSize = useSettingsStore((state) => state.itemSize)
  const compactMode = useSettingsStore((state) => state.compactMode)
  const hideRowControls = useSettingsStore((state) => state.hideRowControls)
  const paletteId = useCurrentPaletteId()
  const sizePx = ITEM_SIZE_PX[itemSize]
  const presets = PALETTES[paletteId].presets
  const resolvedTierColor = resolveTierColorSpec(paletteId, tier.colorSpec)

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

  const { style: colorPickerStyle, updatePosition: updateColorPickerPosition } =
    useAnchoredPosition({
      computePosition: () =>
        colorButtonRef.current
          ? computeColorPickerStyle(colorButtonRef.current)
          : null,
    })

  const {
    style: customColorPickerStyle,
    updatePosition: updateCustomColorPickerPosition,
  } = useAnchoredPosition({
    computePosition: () =>
    {
      if (!customColorButtonRef.current)
      {
        return null
      }

      if (customColorPickerRef.current)
      {
        return computeCustomColorPickerStyle(
          customColorButtonRef.current,
          colorPickerRef.current,
          customColorPickerRef.current.getBoundingClientRect().width,
          customColorPickerRef.current.getBoundingClientRect().height
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

  usePopupClose({
    show: showColorPicker,
    triggerRef: colorButtonRef,
    popupRef: colorPickerRef,
    ignoreRefs: colorPickerIgnoreRefs,
    onClose: closeColorPickers,
    closeOnEscape: false,
    onScroll: updateColorPickerPosition,
  })

  usePopupClose({
    show: showCustomColorPicker,
    triggerRef: customColorButtonRef,
    popupRef: customColorPickerRef,
    ignoreRefs: customColorPickerIgnoreRefs,
    onClose: closeCustomColorPicker,
    closeOnEscape: false,
    onScroll: updateCustomColorPickerPosition,
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

    // remeasure after mount so the custom popup stays within the viewport
    const updatePosition = () =>
    {
      if (customColorButtonRef.current && customColorPickerRef.current)
      {
        updateCustomColorPickerPosition()
      }
    }

    updatePosition()

    const resizeObserver = new ResizeObserver(() => updatePosition())
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
    <div>
      <BoardRowSurface className={isOver ? 'bg-[var(--t-bg-drag-over)]' : ''}>
        <BoardRowContent index={index}>
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

        {!hideRowControls && (
          <div className="flex shrink-0 items-center gap-1 border-l border-[var(--t-border)] bg-[var(--t-bg-page)] px-1.5">
            <div className="flex flex-col items-center justify-center gap-1">
              <button
                type="button"
                className="rounded px-1 py-0.5 text-xs text-[var(--t-text-faint)] hover:text-[var(--t-text)] disabled:opacity-30"
                disabled={index === 0}
                onClick={() => reorderTier(tier.id, 'up')}
                aria-label="Move tier up"
              >
                ▲
              </button>

              <button
                ref={colorButtonRef}
                type="button"
                className="h-4 w-4 rounded-full border border-[var(--t-border-secondary)]"
                style={{ backgroundColor: resolvedTierColor }}
                onClick={() =>
                {
                  if (!showColorPicker && colorButtonRef.current)
                  {
                    updateColorPickerPosition()
                    setShowColorPicker(true)
                    setShowCustomColorPicker(false)
                    setShowSettingsMenu(false)
                  }
                }}
                aria-label="Change tier color"
              />

              <button
                type="button"
                className="rounded px-1 py-0.5 text-xs text-[var(--t-text-faint)] hover:text-[var(--t-text)] disabled:opacity-30"
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

      {showColorPicker && (
        <OverlayFixedPopupSurface
          ref={colorPickerRef}
          className="z-50"
          style={colorPickerStyle}
        >
          <ColorPicker
            value={resolvedTierColor}
            colorSpec={tier.colorSpec}
            presets={presets}
            customTriggerRef={customColorButtonRef}
            showCustomPicker={showCustomColorPicker}
            onChange={(colorSpec) =>
            {
              recolorTier(tier.id, colorSpec)
              closeColorPickers()
            }}
            onToggleCustomPicker={() =>
            {
              if (!showCustomColorPicker && customColorButtonRef.current)
              {
                updateCustomColorPickerPosition()
              }

              setShowCustomColorPicker((current) => !current)
            }}
          />
        </OverlayFixedPopupSurface>
      )}

      {showCustomColorPicker && (
        <OverlayFixedPopupSurface
          ref={customColorPickerRef}
          className="z-[60] shadow-2xl"
          style={{
            ...customColorPickerStyle,
            width: 'min(17.5rem, calc(100vw - 16px))',
          }}
        >
          <CustomColorPicker
            key={`${resolvedTierColor}:${tier.colorSpec.kind === 'palette' ? `${tier.colorSpec.paletteType}:${tier.colorSpec.index}` : 'custom'}`}
            value={resolvedTierColor}
            onApply={(color) =>
            {
              recolorTier(tier.id, createCustomTierColorSpec(color))
              closeColorPickers()
            }}
            onCancel={closeCustomColorPicker}
            onPreview={setPreviewColor}
          />
        </OverlayFixedPopupSurface>
      )}
    </div>
  )
}
