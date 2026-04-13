// src/shared/selection/selectionNavigation.ts
// resolve the next selected index for tabs, radio groups, & grid pickers

export type SelectionNavigationKey =
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'Home'
  | 'End'

interface ResolveNextSelectionIndexOptions
{
  currentIndex: number
  itemCount: number
  key: SelectionNavigationKey
  columns?: number
}

const wrapIndex = (index: number, itemCount: number): number =>
  (index + itemCount) % itemCount

const resolveLastRowIndex = (
  currentIndex: number,
  itemCount: number,
  columns: number
): number =>
{
  let nextIndex = currentIndex % columns

  while (nextIndex + columns < itemCount)
  {
    nextIndex += columns
  }

  return nextIndex
}

export const resolveNextSelectionIndex = ({
  currentIndex,
  itemCount,
  key,
  columns = itemCount,
}: ResolveNextSelectionIndexOptions): number | null =>
{
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount)
  {
    return null
  }

  const normalizedColumns = Math.max(1, Math.min(columns, itemCount))

  switch (key)
  {
    case 'Home':
      return 0
    case 'End':
      return itemCount - 1
    case 'ArrowLeft':
      return wrapIndex(currentIndex - 1, itemCount)
    case 'ArrowRight':
      return wrapIndex(currentIndex + 1, itemCount)
    case 'ArrowUp':
    {
      if (currentIndex - normalizedColumns >= 0)
      {
        return currentIndex - normalizedColumns
      }

      return resolveLastRowIndex(currentIndex, itemCount, normalizedColumns)
    }
    case 'ArrowDown':
    {
      if (currentIndex + normalizedColumns < itemCount)
      {
        return currentIndex + normalizedColumns
      }

      return currentIndex % normalizedColumns
    }
  }
}
