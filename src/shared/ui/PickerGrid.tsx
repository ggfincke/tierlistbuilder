// src/shared/ui/PickerGrid.tsx
// shared picker primitive — grid/flex of clickable preview cards w/ roving
// keyboard navigation, aria-label plumbing, & active-ring chrome

import { useMemo, type ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'
import { useRovingSelection } from '~/shared/selection/useRovingSelection'

interface PickerItem<K extends string>
{
  id: K
  label: string
}

interface PickerGridProps<K extends string, M extends PickerItem<K>>
{
  items: readonly M[]
  activeKey: K
  onSelect: (key: K) => void
  // fallback aria-label used when no external ariaLabelledby is supplied
  ariaLabel: string
  ariaLabelledby?: string
  // number of grid columns; when omitted the items flow as a flex row
  columns?: number
  // extra layout classes appended after the base grid/flex container class
  containerClassName?: string
  // button padding/gap tweak — defaults to `gap-1.5 p-2` (card-style)
  buttonClassName?: string
  renderPreview: (item: M) => ReactNode
}

const BASE_BUTTON =
  'focus-custom flex flex-col items-center rounded-lg transition ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] ' +
  'focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--t-bg-overlay)]'

const ACTIVE_RING =
  'ring-2 ring-[var(--t-accent)] ring-offset-1 ring-offset-[var(--t-bg-overlay)]'

const HOVER_BG = 'hover:bg-[rgb(var(--t-overlay)/0.06)]'

const LABEL_CLASS = 'text-[10px] text-[var(--t-text-faint)]'

export const PickerGrid = <K extends string, M extends PickerItem<K>>({
  items,
  activeKey,
  onSelect,
  ariaLabel,
  ariaLabelledby,
  columns,
  containerClassName,
  buttonClassName = 'gap-1.5 p-2',
  renderPreview,
}: PickerGridProps<K, M>) =>
{
  const itemKeys = useMemo(() => items.map((m) => m.id), [items])
  const { getItemProps, groupProps, isActive } = useRovingSelection({
    items: itemKeys,
    activeKey,
    onSelect,
    kind: 'radio',
    groupLabelledby: ariaLabelledby,
    groupLabel: ariaLabelledby ? undefined : ariaLabel,
    columns,
  })

  const layoutClass = columns !== undefined ? 'grid gap-2' : 'flex gap-2'
  const layoutStyle =
    columns !== undefined
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : undefined

  return (
    <div
      {...groupProps}
      className={joinClassNames(layoutClass, containerClassName)}
      style={layoutStyle}
    >
      {items.map((item, index) =>
      {
        const itemIsActive = isActive(item.id)

        return (
          <button
            key={item.id}
            {...getItemProps(item.id, index)}
            className={joinClassNames(
              BASE_BUTTON,
              buttonClassName,
              itemIsActive ? ACTIVE_RING : HOVER_BG
            )}
          >
            {renderPreview(item)}
            <span className={LABEL_CLASS}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
