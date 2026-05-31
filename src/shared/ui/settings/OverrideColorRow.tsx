// src/shared/ui/settings/OverrideColorRow.tsx
// reusable color override row w/ reset affordance

import { RotateCcw } from 'lucide-react'

import { ColorInput } from '~/shared/ui/ColorInput'
import { SettingRow } from '~/shared/ui/settings/SettingRow'

interface OverrideColorRowProps
{
  label: string
  value: string | null | undefined
  defaultColor: string
  onChange: (value: string) => void
  onReset: () => void
  resetLabel: string
  resetTitle?: string
  disabled?: boolean
  showReset?: boolean
}

export const OverrideColorRow = ({
  label,
  value,
  defaultColor,
  onChange,
  onReset,
  resetLabel,
  resetTitle = 'Reset to default',
  disabled = false,
  showReset = value !== null && value !== undefined,
}: OverrideColorRowProps) => (
  <SettingRow label={label}>
    {(labelId) => (
      <div className="flex items-center gap-2">
        {showReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            aria-label={resetLabel}
            className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)] disabled:opacity-50"
            title={resetTitle}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
        <ColorInput
          value={value ?? defaultColor}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-labelledby={labelId}
        />
      </div>
    )}
  </SettingRow>
)
