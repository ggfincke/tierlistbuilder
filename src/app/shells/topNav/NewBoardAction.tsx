// src/app/shells/topNav/NewBoardAction.tsx
// Scoreboard "+ New board" CTA — creates a blank board session & jumps to
// the workspace. Preset-picker variant lives in MoreTab (fast path here).

import { Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { createBoardSession } from '~/features/workspace/boards/model/boardSession'
import { Button } from '~/shared/ui/Button'

export const NewBoardAction = () =>
{
  const navigate = useNavigate()

  const handleClick = () =>
  {
    createBoardSession()
    navigate('/')
  }

  return (
    <Button
      variant="primary"
      tone="accent"
      size="sm"
      onClick={handleClick}
      aria-label="Create a new board"
      title="Create a new board"
      className="pointer-events-auto whitespace-nowrap"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
      <span className="hidden sm:inline">New board</span>
    </Button>
  )
}
