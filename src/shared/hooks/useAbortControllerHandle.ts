// src/shared/hooks/useAbortControllerHandle.ts
// abort-controller lifecycle helper for cancellable UI tasks

import { useCallback, useEffect, useMemo, useRef } from 'react'

interface AbortControllerHandle
{
  abort: () => void
  begin: () => AbortController
  clear: (controller: AbortController) => boolean
  current: () => AbortController | null
}

export const useAbortControllerHandle = (): AbortControllerHandle =>
{
  const controllerRef = useRef<AbortController | null>(null)

  const abort = useCallback(() =>
  {
    controllerRef.current?.abort()
    controllerRef.current = null
  }, [])

  const begin = useCallback(() =>
  {
    abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [abort])

  const clear = useCallback((controller: AbortController): boolean =>
  {
    if (controllerRef.current !== controller) return false
    controllerRef.current = null
    return true
  }, [])

  const current = useCallback(() => controllerRef.current, [])

  useEffect(() => abort, [abort])

  return useMemo(
    () => ({ abort, begin, clear, current }),
    [abort, begin, clear, current]
  )
}
