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
  title?: string
}

const DEFAULT_TITLE =
  'When auto-cropping, also trim soft drop-shadows around screenshots so framing hugs the actual content.'

export const AutoCropTrimToggle = ({
  checked,
  onChange,
  disabled = false,
  className = '',
  title = DEFAULT_TITLE,
}: AutoCropTrimToggleProps) =>
{
  const labelId = useId()
  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      title={title}
    >
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
