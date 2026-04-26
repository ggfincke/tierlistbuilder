// src/features/workspace/settings/ui/AutoCropTrimToggle.tsx
// inline-labelled toggle for the trim-shadows option, used in toolbar &
// modal layouts where SettingRow's full-width form row would be wrong

import { useId } from 'react'

import { Toggle } from './Toggle'

interface AutoCropTrimToggleProps
{
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export const AutoCropTrimToggle = ({
  checked,
  onChange,
  disabled = false,
  className = '',
}: AutoCropTrimToggleProps) =>
{
  const labelId = useId()
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span id={labelId} className="text-xs text-[var(--t-text-muted)]">
        Trim shadows
      </span>
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        ariaLabelledby={labelId}
      />
    </div>
  )
}
