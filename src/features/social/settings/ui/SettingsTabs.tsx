// src/features/social/settings/ui/SettingsTabs.tsx
// underline tab bar over the /settings sub-routes: NavLinks w/ an accent active
// underline; a dirty-dot flags unsaved profile edits after tabbing away

import { NavLink } from 'react-router-dom'

import {
  SETTINGS_TABS,
  settingsTabPath,
} from '~/features/social/settings/model/settingsTabs'
import { joinClassNames } from '~/shared/lib/className'

interface SettingsTabsProps
{
  profileDirty?: boolean
}

export const SettingsTabs = ({ profileDirty = false }: SettingsTabsProps) => (
  <nav
    aria-label="Settings sections"
    className="flex gap-6 overflow-x-auto border-b border-[var(--t-border)]"
  >
    {SETTINGS_TABS.map((tab) => (
      <NavLink
        key={tab.slug}
        to={settingsTabPath(tab.slug)}
        className={({ isActive }) =>
          joinClassNames(
            'relative -mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-3 text-[13px] font-bold transition-colors',
            isActive
              ? 'border-[var(--t-accent)] text-[var(--t-text)]'
              : 'border-transparent text-[var(--t-text-faint)] hover:border-[var(--t-border-hover)] hover:text-[var(--t-text-secondary)]'
          )
        }
      >
        {tab.label}
        {tab.slug === 'profile' && profileDirty && (
          <>
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[var(--t-accent)]"
            />
            <span className="sr-only">(unsaved changes)</span>
          </>
        )}
      </NavLink>
    ))}
  </nav>
)
