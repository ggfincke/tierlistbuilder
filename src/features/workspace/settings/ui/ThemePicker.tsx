// src/features/workspace/settings/ui/ThemePicker.tsx
// grid of clickable theme preview cards for the Appearance section

import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { THEME_META, THEMES } from '~/shared/theme/tokens'
import type { ThemeId } from '@tierlistbuilder/contracts/lib/theme'
import { PickerGrid } from '~/shared/ui/PickerGrid'

interface ThemePickerProps
{
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

export const ThemePicker = ({ ariaLabelledby }: ThemePickerProps) =>
{
  const themeId = useSettingsStore((s) => s.themeId)
  const setThemeId = useSettingsStore((s) => s.setThemeId)

  return (
    <PickerGrid<ThemeId, (typeof THEME_META)[number]>
      items={THEME_META}
      activeKey={themeId}
      onSelect={setThemeId}
      ariaLabel="App theme"
      ariaLabelledby={ariaLabelledby}
      columns={4}
      renderPreview={renderThemePreview}
    />
  )
}
