// src/features/workspace/imageEditor/model/useConfirmationGate.ts
// reusable request/confirm/cancel gate. caller picks what counts as
// disruptive (count > 0) & supplies the action; count === 0 runs immediately

import { useCallback, useRef, useState } from 'react'

interface ConfirmationGateRequestInput
{
  count: number
  run: () => void
}

export interface ConfirmationGate
{
  open: boolean
  count: number
  request: (input: ConfirmationGateRequestInput) => void
  confirm: () => void
  cancel: () => void
}

export const useConfirmationGate = (): ConfirmationGate =>
{
  const [count, setCount] = useState<number | null>(null)
  const runRef = useRef<(() => void) | null>(null)

  const request = useCallback(
    ({ count: nextCount, run }: ConfirmationGateRequestInput) =>
    {
      if (nextCount <= 0)
      {
        run()
        return
      }
      runRef.current = run
      setCount(nextCount)
    },
    []
  )

  const confirm = useCallback(() =>
  {
    const run = runRef.current
    runRef.current = null
    setCount(null)
    run?.()
  }, [])

  const cancel = useCallback(() =>
  {
    runRef.current = null
    setCount(null)
  }, [])

  return {
    open: count !== null,
    count: count ?? 0,
    request,
    confirm,
    cancel,
  }
}
