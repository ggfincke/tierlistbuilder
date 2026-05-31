// src/features/workspace/imageEditor/model/transform/useDebouncedDraft.ts
// generic live-working-value draft: sync, no-op guards, debounced auto-commit,
// & flush-on-unmount in one place, shared by the transform & padding drafts

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export interface DraftState<T>
{
  working: T
  committed: T
}

// snap working to a newly-committed value only when no edit is in progress
// (working still equals the old committed, or already matches the new one); a
// mid-edit working value is preserved so an external commit can't clobber it
export const syncDraftState = <T>(
  draft: DraftState<T>,
  committed: T,
  equals: (a: T, b: T) => boolean
): DraftState<T> =>
{
  if (equals(draft.committed, committed)) return draft
  if (
    equals(draft.working, draft.committed) ||
    equals(draft.working, committed)
  )
  {
    return { working: committed, committed }
  }
  return { working: draft.working, committed }
}

interface DraftRuntime<T>
{
  working: T
  committed: T
  isDirty: boolean
  flush: (working: T) => void
}

interface DraftCallbacks<T>
{
  equals: (a: T, b: T) => boolean
  onFlush: (working: T) => void
  onAutoCommit: (() => void) | undefined
  onWorkingChange: ((next: T, isDirty: boolean) => void) | undefined
}

interface UseDebouncedDraftInput<T>
{
  // the persisted value the working draft tracks; recompute it each render
  committed: T
  // initial working value; defaults to `committed`
  seedWorking?: () => T
  // value equality — MUST be referentially stable (module fn or useCallback)
  equals: (a: T, b: T) => boolean
  autoCommitMs: number
  // persist a working value (the consumer maps it to its store action, incl. any
  // "clear the override" resolution); called by the debounce timer, an explicit
  // flush, & unmount — never w/ a non-dirty value
  onFlush: (working: T) => void
  // fired only after a debounce-timer-driven commit (e.g. a "saved" flash); not
  // fired on explicit flush or unmount
  onAutoCommit?: () => void
  // fired whenever the working value actually changes, w/ the new dirty state
  onWorkingChange?: (next: T, isDirty: boolean) => void
}

interface DebouncedDraft<T>
{
  working: T
  isDirty: boolean
  setWorking: (next: T | ((current: T) => T)) => void
  // flush a pending edit immediately (no-op when clean)
  flush: () => void
  // drop a pending auto-commit without persisting (consumer commits its own way)
  cancel: () => void
  // the working value when an edit is pending, else null
  readDirty: () => T | null
}

export const useDebouncedDraft = <T>({
  committed,
  seedWorking,
  equals,
  autoCommitMs,
  onFlush,
  onAutoCommit,
  onWorkingChange,
}: UseDebouncedDraftInput<T>): DebouncedDraft<T> =>
{
  const [draftState, setDraftState] = useState<DraftState<T>>(() => ({
    working: seedWorking ? seedWorking() : committed,
    committed,
  }))
  const syncedDraftState = useMemo(
    () => syncDraftState(draftState, committed, equals),
    [committed, draftState, equals]
  )
  if (syncedDraftState !== draftState) setDraftState(syncedDraftState)
  const working = syncedDraftState.working
  const isDirty = !equals(working, committed)

  // mirrors for deferred readers (timer callback, unmount flush) that must see
  // the latest values without re-subscribing; refreshed every render below
  const runtimeRef = useRef<DraftRuntime<T>>({
    working,
    committed,
    isDirty,
    flush: onFlush,
  })
  const callbacksRef = useRef<DraftCallbacks<T>>({
    equals,
    onFlush,
    onAutoCommit,
    onWorkingChange,
  })
  const autoCommitTimerRef = useRef<number | null>(null)

  useLayoutEffect(() =>
  {
    runtimeRef.current = { working, committed, isDirty, flush: onFlush }
    callbacksRef.current = { equals, onFlush, onAutoCommit, onWorkingChange }
  })

  const clearAutoCommitTimer = useCallback(() =>
  {
    if (autoCommitTimerRef.current === null) return
    window.clearTimeout(autoCommitTimerRef.current)
    autoCommitTimerRef.current = null
  }, [])

  const scheduleAutoCommit = useCallback(() =>
  {
    clearAutoCommitTimer()
    autoCommitTimerRef.current = window.setTimeout(() =>
    {
      autoCommitTimerRef.current = null
      const runtime = runtimeRef.current
      if (!runtime.isDirty) return
      runtime.flush(runtime.working)
      runtime.isDirty = false
      callbacksRef.current.onAutoCommit?.()
    }, autoCommitMs)
  }, [autoCommitMs, clearAutoCommitTimer])

  const setWorking = useCallback(
    (nextOrUpdate: T | ((current: T) => T)) =>
    {
      const runtime = runtimeRef.current
      const current = runtime.working
      const next =
        typeof nextOrUpdate === 'function'
          ? (nextOrUpdate as (current: T) => T)(current)
          : nextOrUpdate
      const { equals: eq, onWorkingChange } = callbacksRef.current
      if (eq(current, next)) return
      runtime.working = next
      const nextDirty = !eq(next, runtime.committed)
      runtime.isDirty = nextDirty
      if (nextDirty) scheduleAutoCommit()
      else clearAutoCommitTimer()
      onWorkingChange?.(next, nextDirty)
      setDraftState({ working: next, committed: runtime.committed })
    },
    [clearAutoCommitTimer, scheduleAutoCommit]
  )

  const flush = useCallback(() =>
  {
    const runtime = runtimeRef.current
    if (!runtime.isDirty) return
    clearAutoCommitTimer()
    runtime.flush(runtime.working)
    runtime.isDirty = false
  }, [clearAutoCommitTimer])

  const readDirty = useCallback((): T | null =>
  {
    const runtime = runtimeRef.current
    return runtime.isDirty ? runtime.working : null
  }, [])

  useEffect(
    () => () =>
    {
      clearAutoCommitTimer()
      const runtime = runtimeRef.current
      if (runtime.isDirty) runtime.flush(runtime.working)
    },
    [clearAutoCommitTimer]
  )

  return {
    working,
    isDirty,
    setWorking,
    flush,
    cancel: clearAutoCommitTimer,
    readDirty,
  }
}
