// src/utils/selectionState.ts
// pure selection semantics shared by roving radio groups & tab lists

export type SelectionKind = 'radio' | 'tab'

interface SelectionGroupPropsOptions
{
  kind: SelectionKind
  label?: string
  labelledby?: string
  isGrid?: boolean
}

type SelectionGroupProps =
  | {
      role: 'radiogroup'
      'aria-label'?: string
      'aria-labelledby'?: string
      'aria-orientation'?: 'horizontal'
    }
  | {
      role: 'tablist'
      'aria-label'?: string
      'aria-labelledby'?: string
      'aria-orientation': 'horizontal'
    }

type SelectionItemState =
  | {
      role: 'radio'
      'aria-checked': boolean
    }
  | {
      role: 'tab'
      'aria-selected': boolean
    }

// resolve the active key, falling back to the first option when state drifts
export const resolveSelectionActiveKey = <K extends string>(
  items: readonly K[],
  activeKey: K
): K | null =>
{
  if (items.includes(activeKey))
  {
    return activeKey
  }

  return items[0] ?? null
}

// keep one tabbable option even if the caller's active key is stale
export const resolveRovingTabIndex = <K extends string>(
  key: K,
  activeKey: K | null
): 0 | -1 =>
{
  return activeKey !== null && key === activeKey ? 0 : -1
}

// build shared group-level ARIA props for linear & grid-based selectors
export const getSelectionGroupProps = ({
  kind,
  label,
  labelledby,
  isGrid = false,
}: SelectionGroupPropsOptions): SelectionGroupProps =>
{
  const commonProps = {
    'aria-labelledby': labelledby,
    'aria-label': labelledby ? undefined : label,
  }

  if (kind === 'radio')
  {
    return {
      role: 'radiogroup',
      ...commonProps,
      'aria-orientation': isGrid ? undefined : 'horizontal',
    }
  }

  return {
    role: 'tablist',
    ...commonProps,
    'aria-orientation': 'horizontal',
  }
}

// build shared item-level ARIA props for radio & tab controls
export const getSelectionItemState = (
  kind: SelectionKind,
  isActive: boolean
): SelectionItemState =>
{
  if (kind === 'radio')
  {
    return {
      role: 'radio',
      'aria-checked': isActive,
    }
  }

  return {
    role: 'tab',
    'aria-selected': isActive,
  }
}
