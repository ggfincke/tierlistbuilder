// src/features/workspace/settings/ui/ThemePicker.tsx
// controlled theme preview picker for user preferences

import { THEME_META, THEMES } from '~/shared/theme/tokens'
import type { ThemeId } from '@tierlistbuilder/contracts/lib/theme'
import { PickerGrid } from '~/shared/ui/PickerGrid'

interface ThemePickerProps
{
  value: ThemeId
  onChange: (themeId: ThemeId) => void
  disabled?: boolean
  ariaLabelledby?: string
}

const renderThemePreview = (meta: (typeof THEME_META)[number]) =>
{
  const t = THEMES[meta.id]
  return (
    <div className="flex w-full overflow-hidden rounded">
      <span className="h-5 flex-1" style={{ background: t['bg-page'] }} />
      <span className="h-5 flex-1" style={{ background: t['bg-surface'] }} />
      <span className="h-5 flex-1" style={{ background: t.accent }} />
      <span className="h-5 flex-1" style={{ background: t.text }} />
    </div>
  )
}

export const ThemePicker = ({
  value,
  onChange,
  disabled = false,
  ariaLabelledby,
}: ThemePickerProps) => (
  <PickerGrid<ThemeId, (typeof THEME_META)[number]>
    items={THEME_META}
    activeKey={value}
    onSelect={onChange}
    ariaLabel="App theme"
    ariaLabelledby={ariaLabelledby}
    columns={4}
    renderPreview={renderThemePreview}
    disabled={disabled}
  />
)
