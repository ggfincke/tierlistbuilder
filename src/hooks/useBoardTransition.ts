// src/hooks/useBoardTransition.ts
// two-phase crossfade transition when switching between boards

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useBoardManagerStore } from '../store/useBoardManagerStore'

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

// wraps board switching w/ a fade-out → swap → fade-in sequence
export const useBoardTransition = () =>
{
  const switchBoard = useBoardManagerStore((s) => s.switchBoard)
  const activeBoardId = useBoardManagerStore((s) => s.activeBoardId)
  const [phase, setPhase] = useState<Phase>('idle')

  // use refs to avoid recreating transitionTo on every phase/activeBoardId change
  const phaseRef = useRef(phase)
  useEffect(() =>
  {
    phaseRef.current = phase
  })
  const activeBoardIdRef = useRef(activeBoardId)
  useEffect(() =>
  {
    activeBoardIdRef.current = activeBoardId
  })

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

  // cleanup on unmount
  useEffect(() => cancelTimers, [cancelTimers])

  // fade out, swap board, fade in
  const transitionTo = useCallback(
    (boardId: string) =>
    {
      if (boardId === activeBoardIdRef.current || phaseRef.current !== 'idle')
        return

      setPhase('fading-out')

      // after fade-out completes, swap & fade in
      const t1 = setTimeout(() =>
      {
        switchBoard(boardId)

        // start faded-in state on next frame so the transition fires
        const raf = requestAnimationFrame(() =>
        {
          setPhase('fading-in')

          const t2 = setTimeout(() =>
          {
            setPhase('idle')
            timersRef.current = { timeouts: [], raf: null }
          }, FADE_IN_MS)
          timersRef.current.timeouts.push(t2)
        })
        timersRef.current.raf = raf
      }, FADE_OUT_MS)
      timersRef.current.timeouts.push(t1)
    },
    [switchBoard]
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
