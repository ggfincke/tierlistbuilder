// src/shared/hooks/useFlushableTextDraft.ts
// text draft state w/ explicit flush + reset-key semantics

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

interface DraftState
{
  resetKey: unknown
  value: string
}

interface UseFlushableTextDraftArgs
{
  value: string | null | undefined
  resetKey: unknown
  onCommit: (value: string) => void
}

export interface FlushableTextDraft
{
  value: string
  setValue: Dispatch<SetStateAction<string>>
  flush: () => void
}

export const useFlushableTextDraft = ({
  value,
  resetKey,
  onCommit,
}: UseFlushableTextDraftArgs): FlushableTextDraft =>
{
  const committed = value ?? ''
  const [draftState, setDraftState] = useState<DraftState>(() => ({
    resetKey,
    value: committed,
  }))

  const draft = Object.is(draftState.resetKey, resetKey)
    ? draftState.value
    : committed
  const draftRef = useRef(draft)
  const committedRef = useRef(committed)

  useEffect(() =>
  {
    draftRef.current = draft
  }, [draft])

  useEffect(() =>
  {
    committedRef.current = committed
  }, [committed])

  const setDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (next) =>
    {
      setDraftState((previous) =>
      {
        const current = Object.is(previous.resetKey, resetKey)
          ? previous.value
          : committed
        const nextValue = typeof next === 'function' ? next(current) : next
        return { resetKey, value: nextValue }
      })
    },
    [committed, resetKey]
  )

  const flush = useCallback(() =>
  {
    const next = draftRef.current
    if (next === committedRef.current) return
    onCommit(next)
  }, [onCommit])

  return { value: draft, setValue: setDraft, flush }
}
