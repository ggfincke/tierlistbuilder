// src/features/platform/settings/ui/DataPanel.tsx
// Data tab — account export/import scaffolds & permanent account deletion

import { AccountDangerZone } from '~/features/platform/auth/ui/AccountDangerZone'
import { SetSection } from '~/shared/ui/settings/SettingsChrome'

interface DataPanelProps
{
  onSignedOut: () => void
}

export const DataPanel = ({ onSignedOut }: DataPanelProps) => (
  <SetSection
    eyebrow="Portability"
    title="Export, import & lifecycle"
    subtitle="Download your data or permanently delete your account."
  >
    {/*
      TODO(backend): account-level export (JSON/CSV/PNG) + import + deactivate.
      Per-board export exists in the workspace, but there is no account-wide
      bulk export, no importer, & no reversible "deactivate" (only the hard
      deleteAccount below). Wire those, then restore the export tiles + import
      dropzone + Deactivate button from the design.
    */}
    <div className="border-t border-[var(--t-border)] pt-3">
      <p className="text-[12px] font-bold text-[var(--t-destructive)]">
        Delete account permanently
      </p>
      <p className="mb-2 mt-0.5 text-[10px] text-[var(--t-text-muted)]">
        Removes all boards, takes, and data. Cannot be undone.
      </p>
      <AccountDangerZone onClose={onSignedOut} />
    </div>
  </SetSection>
)
