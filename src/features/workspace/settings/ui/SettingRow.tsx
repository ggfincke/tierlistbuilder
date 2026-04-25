// src/features/workspace/settings/ui/SettingRow.tsx
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
  // auto-clone bare children that themselves accept ariaLabelledby; wrapped
  // controls must use the function form so the caller threads labelId onto
  // the actual labellable element rather than an unreachable wrapper div
  const control =
    !isRenderProp && isValidElement(resolved)
      ? cloneElement(resolved as ReactElement<LabelAwareControlProps>, {
          ariaLabelledby:
            (resolved.props as LabelAwareControlProps).ariaLabelledby ??
            labelId,
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
