// src/features/workspace/boards/ui/board-chrome/BoardLockToggle.tsx
// lock/unlock control for the board action bar

import { Lock, Unlock } from 'lucide-react'

import { ActionButton } from '~/shared/ui/ActionButton'

interface BoardLockToggleProps
{
  boardLocked: boolean
  onBoardLockedChange: (locked: boolean) => void
}

export const BoardLockToggle = ({
  boardLocked,
  onBoardLockedChange,
}: BoardLockToggleProps) => (
  <ActionButton
    label={boardLocked ? 'Unlock board' : 'Lock board'}
    title={boardLocked ? 'Unlock board' : 'Lock board'}
    onClick={() => onBoardLockedChange(!boardLocked)}
  >
    {boardLocked ? (
      <Lock className="h-5 w-5" strokeWidth={1.8} />
    ) : (
      <Unlock className="h-5 w-5" strokeWidth={1.8} />
    )}
  </ActionButton>
)
