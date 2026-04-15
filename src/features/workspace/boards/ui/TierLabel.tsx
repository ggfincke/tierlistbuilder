// src/features/workspace/boards/ui/TierLabel.tsx
// inline-editable tier label cell w/ auto contrast text color

import { memo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { Tier } from '@tierlistbuilder/contracts/workspace/board'
import type { TierId } from '@tierlistbuilder/contracts/lib/ids'
import { resolveTierColorSpec } from '@/shared/theme/tierColors'
import { useCurrentPaletteId } from '@/features/workspace/settings/model/useCurrentPaletteId'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import { useActiveBoardStore } from '@/features/workspace/boards/model/useActiveBoardStore'
import { useInlineEdit } from '@/shared/hooks/useInlineEdit'
import {
  BoardLabelCellFrame,
  TierDescriptionSubtitle,
} from '@/shared/board-ui/BoardPrimitives'

interface TierLabelProps
{
  tier: Tier
  // transient color override for live preview while the custom picker is open
  colorOverride?: string | null
}

// resize the editor to the wrapped text height so typing matches the saved label layout
const resizeEditor = (textarea: HTMLTextAreaElement | null) =>
{
  if (!textarea)
  {
    return
  }

  textarea.style.height = '0px'
  textarea.style.height = `${textarea.scrollHeight}px`
}

export const TierLabel = memo(({ tier, colorOverride }: TierLabelProps) =>
{
  const paletteId = useCurrentPaletteId()
  const displayColor =
    colorOverride ?? resolveTierColorSpec(paletteId, tier.colorSpec)
  const renameTier = useActiveBoardStore((state) => state.renameTier)
  const {
    itemSize,
    labelWidth,
    tierLabelBold,
    tierLabelItalic,
    tierLabelFontSize,
    boardLocked,
  } = useSettingsStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      labelWidth: state.labelWidth,
      tierLabelBold: state.tierLabelBold,
      tierLabelItalic: state.tierLabelItalic,
      tierLabelFontSize: state.tierLabelFontSize,
      boardLocked: state.boardLocked,
    }))
  )

  const { editValue, getInputProps, inputRef, isEditing, startEdit } =
    useInlineEdit<TierId, 'textarea'>({
      onCommit: (id, value) => renameTier(id, value),
    })

  const editing = isEditing(tier.id)

  // resize on enter & on every keystroke while editing
  useEffect(() =>
  {
    if (editing)
    {
      resizeEditor(inputRef.current)
    }
  }, [editing, editValue, inputRef])

  return (
    <BoardLabelCellFrame
      color={displayColor}
      itemSize={itemSize}
      labelWidth={labelWidth}
      tierLabelBold={tierLabelBold}
      tierLabelItalic={tierLabelItalic}
      tierLabelFontSize={tierLabelFontSize}
    >
      {boardLocked ? (
        <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight">
          <span className="block max-w-full break-words [overflow-wrap:anywhere]">
            {tier.name}
          </span>
          <TierDescriptionSubtitle description={tier.description} />
        </div>
      ) : editing ? (
        <div className="flex h-full w-full items-center justify-center">
          <textarea
            {...getInputProps({
              'aria-label': `Rename ${tier.name} tier`,
              rows: 1,
              spellCheck: false,
              className:
                'block max-h-full w-full resize-none overflow-hidden bg-transparent text-center leading-tight outline-none placeholder:text-current/55 [overflow-wrap:anywhere]',
            })}
            ref={inputRef}
          />
        </div>
      ) : (
        // click anywhere on the label to enter edit mode
        <button
          type="button"
          onClick={() => startEdit(tier.id, tier.name)}
          aria-label={`Edit ${tier.name} tier label`}
          className="flex h-full w-full cursor-text flex-col items-center justify-center text-center leading-tight outline-none"
        >
          <span className="block max-w-full break-words [overflow-wrap:anywhere]">
            {tier.name}
          </span>
          <TierDescriptionSubtitle description={tier.description} />
        </button>
      )}
    </BoardLabelCellFrame>
  )
})
