// src/components/board/TierRow.tsx
// tier row component — label, sortable item grid, & row controls

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'

import type { Tier } from '../../types'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useTierListStore } from '../../store/useTierListStore'
import { PALETTES, THEME_PALETTE } from '../../theme'
import { ITEM_SIZE_PX } from '../../utils/constants'
import {
  CUSTOM_COLOR_PICKER_WIDTH_PX,
  computeColorPickerStyle,
  computeCustomColorPickerStyle,
} from '../../utils/popupPosition'
import { usePopupClose } from '../../hooks/usePopupClose'
import { TierItem } from './TierItem'
import { TierLabel } from './TierLabel'
import { TierRowSettingsMenu } from './TierRowSettingsMenu'
import { ColorPicker, CustomColorPicker } from './ColorPicker'

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
  const themeId = useSettingsStore((state) => state.themeId)
  const sizePx = ITEM_SIZE_PX[itemSize]
  const presets = PALETTES[THEME_PALETTE[themeId]].presets

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [previewColor, setPreviewColor] = useState<string | null>(null)
  const [colorPickerStyle, setColorPickerStyle] = useState<CSSProperties>({})
  const [customColorPickerStyle, setCustomColorPickerStyle] =
    useState<CSSProperties>({})

  const colorButtonRef = useRef<HTMLButtonElement>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  const customColorButtonRef = useRef<HTMLButtonElement>(null)
  const customColorPickerRef = useRef<HTMLDivElement>(null)
  const colorPickerIgnoreRefs = useMemo(() => [customColorPickerRef], [])
  const customColorPickerIgnoreRefs = useMemo(() => [colorPickerRef], [])

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
    onScroll: useCallback(() =>
    {
      if (colorButtonRef.current)
      {
        setColorPickerStyle(computeColorPickerStyle(colorButtonRef.current))
      }
    }, []),
  })

  usePopupClose({
    show: showCustomColorPicker,
    triggerRef: customColorButtonRef,
    popupRef: customColorPickerRef,
    ignoreRefs: customColorPickerIgnoreRefs,
    onClose: closeCustomColorPicker,
    closeOnEscape: false,
    onScroll: useCallback(() =>
    {
      if (customColorButtonRef.current && customColorPickerRef.current)
      {
        setCustomColorPickerStyle(
          computeCustomColorPickerStyle(
            customColorButtonRef.current,
            colorPickerRef.current,
            customColorPickerRef.current.getBoundingClientRect().width,
            customColorPickerRef.current.getBoundingClientRect().height
          )
        )
        return
      }

      if (customColorButtonRef.current)
      {
        setCustomColorPickerStyle(
          computeCustomColorPickerStyle(
            customColorButtonRef.current,
            colorPickerRef.current,
            CUSTOM_COLOR_PICKER_WIDTH_PX
          )
        )
      }
    }, []),
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
      if (!customColorButtonRef.current || !customColorPickerRef.current)
      {
        return
      }

      setCustomColorPickerStyle(
        computeCustomColorPickerStyle(
          customColorButtonRef.current,
          colorPickerRef.current,
          customColorPickerRef.current.getBoundingClientRect().width,
          customColorPickerRef.current.getBoundingClientRect().height
        )
      )
    }

    updatePosition()

    const resizeObserver = new ResizeObserver(() => updatePosition())
    resizeObserver.observe(customColorPickerRef.current)

    return () => resizeObserver.disconnect()
  }, [showCustomColorPicker])

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
      <div
        className={`flex transition-colors ${
          isOver ? 'bg-[var(--t-bg-drag-over)]' : 'bg-[var(--t-bg-surface)]'
        }`}
      >
        <div
          className={`flex min-w-0 flex-1 border-b border-l border-[var(--t-border)]${index === 0 ? ' border-t' : ''}`}
        >
          <TierLabel tier={tier} colorOverride={previewColor} />

          <SortableContext items={tier.itemIds} strategy={rectSortingStrategy}>
            <div
              ref={setNodeRef}
              data-testid={`tier-container-${tier.id}`}
              data-tier-id={tier.id}
              className={`flex flex-1 flex-wrap content-start bg-[var(--t-bg-surface)] p-0 ${compactMode ? 'gap-0' : 'gap-px'}`}
              style={{ minHeight: sizePx }}
            >
              {tier.itemIds.map((itemId) => (
                <TierItem key={itemId} itemId={itemId} containerId={tier.id} />
              ))}
            </div>
          </SortableContext>
        </div>

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
                style={{ backgroundColor: tier.color }}
                onClick={() =>
                {
                  if (!showColorPicker && colorButtonRef.current)
                  {
                    setColorPickerStyle(
                      computeColorPickerStyle(colorButtonRef.current)
                    )
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
      </div>

      {showColorPicker && (
        <div
          ref={colorPickerRef}
          className="z-50 rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] shadow-lg"
          style={colorPickerStyle}
        >
          <ColorPicker
            value={tier.color}
            colorSource={tier.colorSource}
            presets={presets}
            customTriggerRef={customColorButtonRef}
            showCustomPicker={showCustomColorPicker}
            onChange={(color, colorSource) =>
            {
              recolorTier(tier.id, color, colorSource)
              closeColorPickers()
            }}
            onToggleCustomPicker={() =>
            {
              if (!showCustomColorPicker && customColorButtonRef.current)
              {
                setCustomColorPickerStyle(
                  computeCustomColorPickerStyle(
                    customColorButtonRef.current,
                    colorPickerRef.current,
                    CUSTOM_COLOR_PICKER_WIDTH_PX
                  )
                )
              }

              setShowCustomColorPicker((current) => !current)
            }}
          />
        </div>
      )}

      {showCustomColorPicker && (
        <div
          ref={customColorPickerRef}
          className="z-[60] rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] shadow-2xl"
          style={{
            ...customColorPickerStyle,
            width: 'min(17.5rem, calc(100vw - 16px))',
          }}
        >
          <CustomColorPicker
            key={`${tier.color}:${tier.colorSource?.paletteType ?? 'custom'}:${tier.colorSource?.index ?? -1}`}
            value={tier.color}
            onApply={(color) =>
            {
              recolorTier(tier.id, color, null)
              closeColorPickers()
            }}
            onCancel={closeCustomColorPicker}
            onPreview={setPreviewColor}
          />
        </div>
      )}
    </div>
  )
}
