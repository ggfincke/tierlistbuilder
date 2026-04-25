// src/app/shells/useModalStack.ts
// typed keyed modal state — wrapper-presence marks open, payload types differ
// per key. returned object stays stable across non-modal renders

import { useCallback, useMemo, useState } from 'react'

type AnyPayloadMap = Record<string, unknown>

// payload argument tuple — optional for keys whose payload type includes
// undefined, required for keys that demand a concrete value on open
type OpenArgs<
  TPayloads extends AnyPayloadMap,
  K extends keyof TPayloads,
> = undefined extends TPayloads[K]
  ? [payload?: TPayloads[K]]
  : [payload: TPayloads[K]]

// presence of the wrapper distinguishes "open w/ undefined payload" from
// "closed"; `state[key]?.payload` reads the value w/o that ambiguity
export type ModalStackState<TPayloads extends AnyPayloadMap> = {
  readonly [K in keyof TPayloads]?: { payload: TPayloads[K] }
}

export interface ModalStack<TPayloads extends AnyPayloadMap>
{
  state: ModalStackState<TPayloads>
  open: <K extends keyof TPayloads>(
    key: K,
    ...args: OpenArgs<TPayloads, K>
  ) => void
  close: <K extends keyof TPayloads>(key: K) => void
}

export const useModalStack = <
  TPayloads extends AnyPayloadMap,
>(): ModalStack<TPayloads> =>
{
  const [state, setState] = useState<ModalStackState<TPayloads>>({})

  const open = useCallback(
    <K extends keyof TPayloads>(key: K, ...args: OpenArgs<TPayloads, K>) =>
    {
      const payload = args[0] as TPayloads[K]
      setState((prev) => ({ ...prev, [key]: { payload } }))
    },
    []
  )

  const close = useCallback(<K extends keyof TPayloads>(key: K) =>
  {
    setState((prev) =>
    {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  return useMemo(() => ({ state, open, close }), [state, open, close])
}
