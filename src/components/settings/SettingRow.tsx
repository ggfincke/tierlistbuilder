// src/components/settings/SettingRow.tsx
// reusable setting row w/ label on left, control on right

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react'

interface SettingRowProps
{
  label: string
  children: ReactNode
}

interface LabelAwareControlProps
{
  ariaLabelledby?: string
}

export const SettingRow = ({ label, children }: SettingRowProps) =>
{
  const labelId = useId()
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<LabelAwareControlProps>, {
        ariaLabelledby:
          (children.props as LabelAwareControlProps).ariaLabelledby ?? labelId,
      })
    : children

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span id={labelId} className="text-sm text-[var(--t-text-secondary)]">
        {label}
      </span>
      {control}
    </div>
  )
}
