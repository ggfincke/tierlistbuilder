// src/shared/ui/settings/SettingRow.tsx
// reusable setting row w/ label left, control right. accepts a render-prop child
// so composite controls can route labelId to the actual labelled element

import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react'

interface LabelAwareControlProps
{
  ariaLabelledby?: string
}

interface SettingRowProps
{
  label: string
  children: ReactNode | ((labelId: string) => ReactNode)
}

export const SettingRow = ({ label, children }: SettingRowProps) =>
{
  const labelId = useId()
  const isRenderProp = typeof children === 'function'
  const resolved = isRenderProp ? children(labelId) : children
  // auto-clone only custom React components — native HTML elements treat
  // the camelCase prop as invalid; consumers wrapping in a div should use
  // the function form to thread labelId to the labellable element
  const shouldAutoClone =
    !isRenderProp &&
    isValidElement(resolved) &&
    typeof resolved.type !== 'string'
  const control = shouldAutoClone
    ? cloneElement(resolved as ReactElement<LabelAwareControlProps>, {
        ariaLabelledby:
          (resolved.props as LabelAwareControlProps).ariaLabelledby ?? labelId,
      })
    : resolved

  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span id={labelId} className="text-sm text-[var(--t-text-secondary)]">
        {label}
      </span>
      {control}
    </div>
  )
}
