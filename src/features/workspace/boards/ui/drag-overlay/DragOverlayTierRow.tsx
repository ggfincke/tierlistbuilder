// src/features/workspace/boards/ui/drag-overlay/DragOverlayTierRow.tsx
// full-width row "slab" rendered in the dnd-kit DragOverlay while reordering
// tiers — mirrors the live row shape but without items or interactivity

import { memo } from 'react'
import { GripVertical, Settings as SettingsIcon } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useBoardItemSize } from '~/features/workspace/boards/model/boardRenderOverrides'
import { useCurrentPaletteId } from '~/features/workspace/settings/model/useCurrentPaletteId'
import { resolveTierColorSpec } from '~/shared/theme/tierColors'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import { getBoardItemAspectRatio } from '~/shared/board-ui/aspectRatio'
import {
  BoardItemsGrid,
  BoardLabelCellFrame,
  BoardRowContent,
  BoardRowSurface,
  TierDescriptionSubtitle,
} from '~/shared/board-ui/BoardPrimitives'

interface DragOverlayTierRowProps
{
  tier: Tier
  width: number | null
  height: number | null
}

export const DragOverlayTierRow = memo(
  ({ tier, width, height }: DragOverlayTierRowProps) =>
  {
    const paletteId = useCurrentPaletteId()
    const boardAspectRatio = useActiveBoardStore((state) =>
      getBoardItemAspectRatio(state)
    )
    const itemSize = useBoardItemSize()
    const {
      labelWidth,
      tierLabelBold,
      tierLabelItalic,
      tierLabelFontSize,
      compactMode,
      boardLocked,
      hideRowControls,
    } = usePreferencesStore(
      useShallow((state) => ({
        labelWidth: state.labelWidth,
        tierLabelBold: state.tierLabelBold,
        tierLabelItalic: state.tierLabelItalic,
        tierLabelFontSize: state.tierLabelFontSize,
        compactMode: state.compactMode,
        boardLocked: state.boardLocked,
        hideRowControls: state.hideRowControls,
      }))
    )

    const showControls = !boardLocked && !hideRowControls
    const tierColor = resolveTierColorSpec(paletteId, tier.colorSpec)
    const { height: slotHeight } = itemSlotDimensions(
      itemSize,
      boardAspectRatio
    )

    return (
      <div
        aria-hidden
        className="pointer-events-none rounded-sm shadow-2xl ring-1 ring-[var(--t-border-hover)]"
        style={{
          width: width ?? undefined,
          height: height ?? undefined,
        }}
      >
        <BoardRowSurface>
          <BoardRowContent index={0}>
            {showControls && (
              <span className="flex shrink-0 items-center px-0.5 text-[var(--t-text-faint)]">
                <GripVertical className="h-4 w-4" strokeWidth={1.5} />
              </span>
            )}
            <BoardLabelCellFrame
              color={tierColor}
              itemSize={itemSize}
              labelWidth={labelWidth}
              tierLabelBold={tierLabelBold}
              tierLabelItalic={tierLabelItalic}
              tierLabelFontSize={tierLabelFontSize}
              itemAspectRatio={boardAspectRatio}
            >
              <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight">
                <span className="block max-w-full break-words [overflow-wrap:anywhere]">
                  {tier.name}
                </span>
                <TierDescriptionSubtitle description={tier.description} />
              </div>
            </BoardLabelCellFrame>
            <BoardItemsGrid
              compactMode={compactMode}
              minHeightPx={slotHeight}
            />
          </BoardRowContent>

          {showControls && (
            <div className="flex shrink-0 items-center gap-1 border-l border-[var(--t-border)] bg-[var(--t-bg-page)] px-1.5 max-sm:px-1">
              <div className="flex flex-col items-center justify-center gap-1">
                <span className="px-1 py-0.5 text-xs text-[var(--t-text-faint)] opacity-40">
                  ▲
                </span>
                <span
                  className="h-4 w-4 rounded-full border border-[var(--t-border-secondary)]"
                  style={{ backgroundColor: tierColor }}
                />
                <span className="px-1 py-0.5 text-xs text-[var(--t-text-faint)] opacity-40">
                  ▼
                </span>
              </div>
              <span className="flex items-center rounded p-1 text-[var(--t-text-faint)] max-sm:p-2">
                <SettingsIcon className="h-3.5 w-3.5" strokeWidth={1.8} />
              </span>
            </div>
          )}
        </BoardRowSurface>
      </div>
    )
  }
)
