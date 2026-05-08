// src/shared/ui/selectChange.ts
// typed select change helpers for literal-string option sets

import type { ChangeEvent } from 'react'

export const createTypedSelectChangeHandler =
  <TValue extends string>(
    values: readonly TValue[],
    onChange: (next: TValue) => void
  ) =>
  (event: ChangeEvent<HTMLSelectElement>): void =>
  {
    const next = event.currentTarget.value
    if ((values as readonly string[]).includes(next))
    {
      onChange(next as TValue)
    }
  }
