// src/features/social/settings/ui/AppearancePanel.tsx
// Appearance tab: app-chrome look & feel plus the keyboard-shortcuts reference

import { ShortcutsList } from '~/features/workspace/shortcuts/ui/ShortcutsList'
import { SetSection } from '~/shared/ui/settings/SettingsChrome'
import { AppearanceSection } from './AppearanceSection'

const ShortcutsSection = () => (
  <SetSection
    eyebrow="Reference"
    title="Keyboard shortcuts"
    subtitle="Most apply while editing a board."
  >
    <ShortcutsList />
  </SetSection>
)

export const AppearancePanel = () => (
  <div className="flex flex-col gap-4">
    <AppearanceSection />
    <ShortcutsSection />
  </div>
)
