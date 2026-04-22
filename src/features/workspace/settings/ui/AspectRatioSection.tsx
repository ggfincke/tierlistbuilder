// src/features/workspace/settings/ui/AspectRatioSection.tsx
// board-level item aspect ratio picker & mismatch list, wired to the active board store

import { useMemo } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import type {
  ImageFit,
  TierItem,
} from '@tierlistbuilder/contracts/workspace/board'
import type { ItemId } from '@tierlistbuilder/contracts/lib/ids'
import {
  findMismatchedItems,
  formatAspectRatio,
  getBoardAspectRatioMode,
  getEffectiveImageFit,
} from '~/features/workspace/boards/lib/aspectRatio'
import { ItemContent } from '~/shared/board-ui/ItemContent'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { useBoardAspectRatioPicker } from '../model/useBoardAspectRatioPicker'
import { AspectRatioChips, CustomRatioInput } from './AspectRatioPicker'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { Toggle } from './Toggle'

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
  } = useBoardAspectRatioPicker()
  const mode = useActiveBoardStore((state) => getBoardAspectRatioMode(state))
  const items = useActiveBoardStore((state) => state.items)
  const setItemImageFit = useActiveBoardStore((state) => state.setItemImageFit)
  const promptDismissed = useActiveBoardStore(
    (state) => state.aspectRatioPromptDismissed === true
  )
  const setAspectRatioPromptDismissed = useActiveBoardStore(
    (state) => state.setAspectRatioPromptDismissed
  )
  const boardDefaultFit = useActiveBoardStore(
    (state) => state.defaultItemImageFit
  )

  const issuesList = useMemo<TierItem[]>(
    () => findMismatchedItems({ items, itemAspectRatio: boardAspectRatio }),
    [items, boardAspectRatio]
  )

  const ratioLabel = formatAspectRatio(boardAspectRatio)
  const sourceLabel = mode === 'auto' ? 'derived from items' : 'pinned'

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

      {issuesList.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] p-2">
          <h4 className="mb-1.5 text-xs font-semibold text-[var(--t-text-secondary)]">
            {issuesList.length} item{issuesList.length > 1 ? 's' : ''} don
            &apos;t match the board ratio
          </h4>
          <ul className="flex flex-col gap-1.5">
            {issuesList.map((item) => (
              <IssueItemRow
                key={item.id}
                item={item}
                boardDefaultFit={boardDefaultFit}
                onSetFit={setItemImageFit}
              />
            ))}
          </ul>
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

interface IssueItemRowProps
{
  item: TierItem
  boardDefaultFit: ImageFit | undefined
  onSetFit: (itemId: ItemId, fit: ImageFit | null) => void
}

const IssueItemRow = ({
  item,
  boardDefaultFit,
  onSetFit,
}: IssueItemRowProps) =>
{
  const itemRatio = item.aspectRatio ?? 1
  const effectiveFit = getEffectiveImageFit(item, boardDefaultFit)
  const label = item.label ?? 'Untitled item'

  return (
    <li className="flex items-center gap-2">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-[var(--t-border-secondary)]">
        <ItemContent item={item} fit="contain" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs text-[var(--t-text)]">{label}</span>
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
