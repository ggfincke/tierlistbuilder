// src/shared/selection/useRovingSelection.ts
// keyboard navigation & focus management for roving-tabindex selection groups

import { useCallback, useMemo, useRef } from 'react'

import {
  resolveNextSelectionIndex,
  type SelectionNavigationKey,
} from './selectionNavigation'
import {
  getSelectionGroupProps,
  getSelectionItemState,
  resolveRovingTabIndex,
  resolveSelectionActiveKey,
  type SelectionKind,
} from './selectionState'

const LINEAR_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
])

const GRID_KEYS: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

interface UseRovingSelectionOptions<K extends string>
{
  items: readonly K[]
  activeKey: K
  onSelect: (key: K) => void
  kind: SelectionKind
  groupLabelledby?: string
  groupLabel?: string
  columns?: number
}

interface RovingGroupProps
{
  role: 'radiogroup' | 'tablist'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-orientation'?: 'horizontal'
}

interface RovingItemProps
{
  ref: (node: HTMLButtonElement | null) => void
  type: 'button'
  role: 'radio' | 'tab'
  'aria-checked'?: boolean
  'aria-selected'?: boolean
  tabIndex: 0 | -1
  onClick: () => void
  onKeyDown: (event: React.KeyboardEvent) => void
}

interface UseRovingSelectionResult<K extends string>
{
  activeKey: K | null
  groupProps: RovingGroupProps
  getItemProps: (key: K, index: number) => RovingItemProps
  isActive: (key: K) => boolean
}

export const useRovingSelection = <K extends string>({
  items,
  activeKey,
  onSelect,
  kind,
  groupLabelledby,
  groupLabel,
  columns,
}: UseRovingSelectionOptions<K>): UseRovingSelectionResult<K> =>
{
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({})

  const isGrid = columns !== undefined && columns < items.length
  const resolvedActiveKey = resolveSelectionActiveKey(items, activeKey)
  const groupProps = useMemo(
    () =>
      getSelectionGroupProps({
        kind,
        labelledby: groupLabelledby,
        label: groupLabel,
        isGrid,
      }),
    [groupLabel, groupLabelledby, isGrid, kind]
  )

  const isActive = useCallback(
    (key: K): boolean => key === resolvedActiveKey,
    [resolvedActiveKey]
  )

  const getItemProps = useCallback(
    (key: K, index: number): RovingItemProps =>
    {
      const itemIsActive = isActive(key)

      return {
        ...getSelectionItemState(kind, itemIsActive),
        ref: (node: HTMLButtonElement | null) =>
        {
          refs.current[key] = node
        },
        type: 'button',
        tabIndex: resolveRovingTabIndex(key, resolvedActiveKey),
        onClick: () => onSelect(key),
        onKeyDown: (event: React.KeyboardEvent) =>
        {
          const navKey = event.key as SelectionNavigationKey
          const accepted = isGrid ? GRID_KEYS : LINEAR_KEYS

          if (!accepted.has(navKey))
          {
            return
          }

          const nextIndex = resolveNextSelectionIndex({
            currentIndex: index,
            itemCount: items.length,
            key: navKey,
            columns: columns ?? items.length,
          })

          if (nextIndex === null)
          {
            return
          }

          event.preventDefault()

          const nextKey = items[nextIndex]

          if (!nextKey)
          {
            return
          }

          onSelect(nextKey)
          refs.current[nextKey]?.focus()
        },
      }
    },
    [columns, isActive, isGrid, items, kind, onSelect, resolvedActiveKey]
  )

  return {
    activeKey: resolvedActiveKey,
    groupProps,
    getItemProps,
    isActive,
  }
}
