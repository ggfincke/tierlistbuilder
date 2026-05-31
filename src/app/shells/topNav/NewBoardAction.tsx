// src/app/shells/topNav/NewBoardAction.tsx
// "+ New board" trigger. The action stays disabled until
// bootstrap has loaded the persisted active board into the in-memory store.

import { Plus } from 'lucide-react'

import { useAppReady } from '~/app/bootstrap/useAppBootstrap'
import { useStartBlankBoard } from '~/features/workspace/boards/model/useStartBlankBoard'
import { Button } from '~/shared/ui/Button'

export const NewBoardAction = () =>
{
  const appReady = useAppReady()
  const { start: handleStartBlank, isPending } = useStartBlankBoard()
  const disabled = !appReady || isPending

  return (
    <Button
      variant="primary"
      tone="accent"
      size="sm"
      onClick={handleStartBlank}
      disabled={disabled}
      aria-label="Create a new board"
      title={appReady ? 'Create a new board' : 'Loading boards'}
      className="pointer-events-auto whitespace-nowrap"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
      <span className="hidden sm:inline">New board</span>
    </Button>
  )
}
