// src/features/workspace/boards/model/useBoardTransition.ts
// two-phase crossfade transition when switching between boards

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { switchBoardSession } from '~/features/workspace/boards/data/local/localBoardSession'
import type { BoardId } from '@tierlistbuilder/contracts/lib/ids'

const FADE_OUT_MS = 120
const FADE_IN_MS = 180

type Phase = 'idle' | 'fading-out' | 'fading-in'

// opacity-only transitions — transform breaks dnd-kit coordinate calculations
const STYLE_FADING_OUT: React.CSSProperties = {
  opacity: 0,
  transition: `opacity ${FADE_OUT_MS}ms ease-in`,
}

const STYLE_FADING_IN: React.CSSProperties = {
  opacity: 1,
  transition: `opacity ${FADE_IN_MS}ms ease-out`,
}

const STYLE_IDLE: React.CSSProperties = {}

// wraps board switching w/ a fade-out -> swap -> fade-in sequence
export const useBoardTransition = () =>
{
  const activeBoardId = useWorkspaceBoardRegistryStore((s) => s.activeBoardId)
  const [phase, setPhase] = useState<Phase>('idle')
  const mountedRef = useRef(true)

  // use refs to avoid recreating transitionTo on every phase/activeBoardId change
  const phaseRef = useRef(phase)
  useEffect(() =>
  {
    phaseRef.current = phase
  }, [phase])
  const activeBoardIdRef = useRef(activeBoardId)
  useEffect(() =>
  {
    activeBoardIdRef.current = activeBoardId
  }, [activeBoardId])

  // track pending timers & RAF for cleanup
  const timersRef = useRef<{
    timeouts: ReturnType<typeof setTimeout>[]
    raf: number | null
  }>({
    timeouts: [],
    raf: null,
  })

  // cancel all pending timers
  const cancelTimers = useCallback(() =>
  {
    for (const id of timersRef.current.timeouts) clearTimeout(id)
    if (timersRef.current.raf !== null)
      cancelAnimationFrame(timersRef.current.raf)
    timersRef.current = { timeouts: [], raf: null }
  }, [])

  const safeSetPhase = useCallback((nextPhase: Phase) =>
  {
    if (mountedRef.current)
    {
      setPhase(nextPhase)
    }
  }, [])

  useEffect(
    () => () =>
    {
      mountedRef.current = false
      cancelTimers()
    },
    [cancelTimers]
  )

  // fade out, swap board, fade in
  const transitionTo = useCallback(
    (boardId: BoardId) =>
    {
      if (boardId === activeBoardIdRef.current || phaseRef.current !== 'idle')
        return

      safeSetPhase('fading-out')

      // after fade-out completes, swap & fade in
      const t1 = setTimeout(() =>
      {
        void switchBoardSession(boardId)
          .then(() =>
          {
            if (!mountedRef.current)
            {
              return
            }

            const raf = requestAnimationFrame(() =>
            {
              safeSetPhase('fading-in')

              const t2 = setTimeout(() =>
              {
                safeSetPhase('idle')
                timersRef.current = { timeouts: [], raf: null }
              }, FADE_IN_MS)
              timersRef.current.timeouts.push(t2)
            })
            timersRef.current.raf = raf
          })
          .catch(() =>
          {
            safeSetPhase('idle')
            timersRef.current = { timeouts: [], raf: null }
          })
      }, FADE_OUT_MS)
      timersRef.current.timeouts.push(t1)
    },
    [safeSetPhase]
  )

  const style = useMemo(
    () =>
      phase === 'fading-out'
        ? STYLE_FADING_OUT
        : phase === 'fading-in'
          ? STYLE_FADING_IN
          : STYLE_IDLE,
    [phase]
  )

  return { style, transitionTo }
}
