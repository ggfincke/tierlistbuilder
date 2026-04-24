// src/features/workspace/settings/ui/AspectRatioSection.tsx
// board-level item aspect ratio picker & mismatch list, wired to the active board store

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  formatAspectRatio,
  getEffectiveImageFit,
  groupMismatchedItems,
  type MismatchGroup,
} from '~/features/workspace/boards/lib/aspectRatio'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { useBoardAspectRatioPicker } from '../model/useBoardAspectRatioPicker'
import { AspectRatioChips, CustomRatioInput } from './AspectRatioPicker'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { Toggle } from './Toggle'

const MAX_GROUP_THUMBNAILS = 3

export const AspectRatioSection = () =>
{
  const {
    boardAspectRatio,
    selectedOption,
    customWidth,
    customHeight,
    setCustomWidth,
    setCustomHeight,
    customOpen,
    handleOption,
    applyCustom,
    canApplyCustom,
    mode,
  } = useBoardAspectRatioPicker()
  const {
    items,
    setItemImageFit,
    setItemsImageFit,
    promptDismissed,
    setAspectRatioPromptDismissed,
    boardDefaultFit,
    setDefaultItemImageFit,
  } = useActiveBoardStore(
    useShallow((state) => ({
      items: state.items,
      setItemImageFit: state.setItemImageFit,
      setItemsImageFit: state.setItemsImageFit,
      promptDismissed: state.aspectRatioPromptDismissed === true,
      setAspectRatioPromptDismissed: state.setAspectRatioPromptDismissed,
      boardDefaultFit: state.defaultItemImageFit,
      setDefaultItemImageFit: state.setDefaultItemImageFit,
    }))
  )

  const groups = useMemo<MismatchGroup[]>(
    () => groupMismatchedItems({ items, itemAspectRatio: boardAspectRatio }),
    [items, boardAspectRatio]
  )
  const totalMismatched = useMemo(
    () => groups.reduce((sum, g) => sum + g.items.length, 0),
    [groups]
  )

  const ratioLabel = formatAspectRatio(boardAspectRatio)
  const sourceLabel = mode === 'auto' ? 'derived from items' : 'pinned'

  const handleSetAll = (fit: ImageFit) =>
  {
    const ids = groups.flatMap((g) => g.items.map((item) => item.id))
    if (ids.length === 0) return
    setItemsImageFit(ids, fit)
    setDefaultItemImageFit(fit)
  }

  return (
    <SettingsSection title="Image Aspect Ratio">
      <p className="-mt-1 mb-2 text-xs text-[var(--t-text-muted)]">
        Current: <span className="text-[var(--t-text)]">{ratioLabel}</span>{' '}
        <span className="text-[var(--t-text-faint)]">({sourceLabel})</span>
      </p>

      <SettingRow label="Ratio">
        <AspectRatioChips
          selectedOption={selectedOption}
          onSelect={handleOption}
          alignClassName="justify-end"
        />
      </SettingRow>

      {customOpen && (
        <CustomRatioInput
          width={customWidth}
          height={customHeight}
          onWidthChange={setCustomWidth}
          onHeightChange={setCustomHeight}
          onApply={applyCustom}
          canApply={canApplyCustom}
          className="mt-1"
        />
      )}

      {groups.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-3 py-2">
            <span className="text-xs font-semibold text-[var(--t-text-secondary)]">
              {totalMismatched} item{totalMismatched === 1 ? '' : 's'}{' '}
              don&apos;t match the board ratio
            </span>
            <SegmentedControl<ImageFit>
              ariaLabel="Set fit for all mismatched items"
              options={[
                { value: 'cover', label: 'Cover all' },
                { value: 'contain', label: 'Contain all' },
              ]}
              value={boardDefaultFit ?? 'cover'}
              onChange={handleSetAll}
            />
          </div>
          <MismatchRows
            groups={groups}
            boardDefaultFit={boardDefaultFit}
            onSetGroupFit={setItemsImageFit}
            onSetItemFit={setItemImageFit}
          />
        </div>
      )}

      <SettingRow label="Mixed Ratio Prompt">
        <Toggle
          checked={!promptDismissed}
          onChange={(value) => setAspectRatioPromptDismissed(!value)}
        />
      </SettingRow>
    </SettingsSection>
  )
}

interface MismatchGroupRowProps
{
  group: MismatchGroup
  boardDefaultFit: ImageFit | undefined
  onSetGroupFit: (itemIds: ItemId[], fit: ImageFit | null) => void
  onSetItemFit: (itemId: ItemId, fit: ImageFit | null) => void
}

interface MismatchItemRowProps
{
  item: TierItem
  boardDefaultFit: ImageFit | undefined
  onSetFit: (itemId: ItemId, fit: ImageFit | null) => void
  nested?: boolean
}

interface MismatchRowsProps
{
  groups: readonly MismatchGroup[]
  boardDefaultFit: ImageFit | undefined
  onSetGroupFit: (itemIds: ItemId[], fit: ImageFit | null) => void
  onSetItemFit: (itemId: ItemId, fit: ImageFit | null) => void
}

// pick the fit that the most items in the group render as; used to show a
// sensible default on the group's toggle when per-item overrides are mixed
const dominantGroupFit = (
  items: readonly TierItem[],
  boardDefaultFit: ImageFit | undefined
): ImageFit =>
{
  let cover = 0
  let contain = 0
  for (const item of items)
  {
    if (getEffectiveImageFit(item, boardDefaultFit) === 'contain') contain += 1
    else cover += 1
  }
  return contain > cover ? 'contain' : 'cover'
}

export const MismatchRows = ({
  groups,
  boardDefaultFit,
  onSetGroupFit,
  onSetItemFit,
}: MismatchRowsProps) => (
  <ul className="flex max-h-72 flex-col divide-y divide-[var(--t-border-secondary)] overflow-y-auto">
    {groups.map((group) => (
      <MismatchGroupRow
        key={group.representative}
        group={group}
        boardDefaultFit={boardDefaultFit}
        onSetGroupFit={onSetGroupFit}
        onSetItemFit={onSetItemFit}
      />
    ))}
  </ul>
)

const MismatchGroupRow = ({
  group,
  boardDefaultFit,
  onSetGroupFit,
  onSetItemFit,
}: MismatchGroupRowProps) =>
{
  const { representative, items } = group
  if (items.length === 1)
  {
    return (
      <MismatchItemRow
        item={items[0]}
        boardDefaultFit={boardDefaultFit}
        onSetFit={onSetItemFit}
      />
    )
  }

  const ratioLabel = formatAspectRatio(representative)
  const thumbnails = items.slice(0, MAX_GROUP_THUMBNAILS)
  const remaining = items.length - thumbnails.length
  const fit = dominantGroupFit(items, boardDefaultFit)

  return (
    <li>
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {thumbnails.map((item) => (
            <div
              key={item.id}
              className="relative h-8 w-8 overflow-hidden rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]"
              title={item.label ?? 'Item'}
            >
              <ItemContent item={item} fit="contain" />
            </div>
          ))}
          {remaining > 0 && (
            <span className="text-[0.65rem] text-[var(--t-text-faint)]">
              +{remaining}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium text-[var(--t-text)]">
            {ratioLabel}
          </span>
          <span className="text-[0.65rem] text-[var(--t-text-faint)]">
            {items.length} items
          </span>
        </div>
        <SegmentedControl<ImageFit>
          ariaLabel={`Set fit for ${ratioLabel} group`}
          options={[
            { value: 'cover', label: 'Cover' },
            { value: 'contain', label: 'Contain' },
          ]}
          value={fit}
          onChange={(nextFit) =>
            onSetGroupFit(
              items.map((item) => item.id),
              nextFit
            )
          }
        />
      </div>
      <ul className="divide-y divide-[var(--t-border-secondary)] border-t border-[var(--t-border-secondary)]">
        {items.map((item) => (
          <MismatchItemRow
            key={item.id}
            item={item}
            boardDefaultFit={boardDefaultFit}
            onSetFit={onSetItemFit}
            nested
          />
        ))}
      </ul>
    </li>
  )
}

const MismatchItemRow = ({
  item,
  boardDefaultFit,
  onSetFit,
  nested = false,
}: MismatchItemRowProps) =>
{
  const itemRatio = item.aspectRatio ?? 1
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const label = item.label ?? 'Untitled item'

  return (
    <li
      className={`flex items-center gap-3 px-3 py-2 ${
        nested ? 'bg-[var(--t-bg-surface)] pl-6' : ''
      }`}
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)]">
        <ItemContent item={item} fit="contain" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-[var(--t-text)]">
          {label}
        </span>
        <span className="text-[0.65rem] text-[var(--t-text-faint)]">
          {formatAspectRatio(itemRatio)}
        </span>
      </div>
      <SegmentedControl<ImageFit>
        ariaLabel={`Fit for ${label}`}
        options={[
          { value: 'cover', label: 'Cover' },
          { value: 'contain', label: 'Contain' },
        ]}
        value={effectiveFit}
        onChange={(fit) => onSetFit(item.id, fit)}
      />
    </li>
  )
}
