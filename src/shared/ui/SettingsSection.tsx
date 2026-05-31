// src/shared/ui/SettingsSection.tsx
// legacy settings-section wrapper over the shared settings chrome

import { SetSection } from '~/shared/ui/settings/SettingsChrome'

interface SettingsSectionProps
{
  title: string
  children: React.ReactNode
}

export const SettingsSection = ({ title, children }: SettingsSectionProps) => (
  <SetSection title={title} dense>
    {children}
  </SetSection>
)
