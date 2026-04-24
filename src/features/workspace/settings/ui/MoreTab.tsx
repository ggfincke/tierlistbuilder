// src/features/workspace/settings/ui/MoreTab.tsx
// more tab content for export prefs, storage, lists, & shortcuts

import { useId, useState } from 'react'
import { Github, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import type { TierPreset } from '@tierlistbuilder/contracts/workspace/tierPreset'
import {
  createBoardSession,
  createBoardSessionFromPreset,
} from '~/features/workspace/boards/model/boardSession'
import { useWorkspaceBoardRegistryStore } from '~/features/workspace/boards/model/useWorkspaceBoardRegistryStore'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import { ColorInput } from '~/shared/ui/ColorInput'
import {
  STORAGE_NEAR_FULL_MESSAGE,
  STORAGE_QUOTA_BYTES,
} from '~/shared/lib/storageMetering'
import { GITHUB_REPO_URL } from '~/shared/lib/urls'
import { THEMES } from '~/shared/theme/tokens'
import { PresetPickerModal } from '~/features/workspace/tier-presets/ui/PresetPickerModal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { ShortcutsList } from '~/features/workspace/shortcuts/ui/ShortcutsList'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { SettingRow } from './SettingRow'
import { Toggle } from './Toggle'

interface MoreTabProps
{
  storageBytes: number
  onClose: () => void
  onRequestClearAll: () => void
}

export const MoreTab = ({
  storageBytes,
  onClose,
  onRequestClearAll,
}: MoreTabProps) =>
{
  const boards = useWorkspaceBoardRegistryStore((state) => state.boards)
  const {
    exportBackgroundOverride,
    themeId,
    confirmBeforeDelete,
    setExportBackgroundOverride,
    setConfirmBeforeDelete,
  } = useSettingsStore(
    useShallow((state) => ({
      exportBackgroundOverride: state.exportBackgroundOverride,
      themeId: state.themeId,
      confirmBeforeDelete: state.confirmBeforeDelete,
      setExportBackgroundOverride: state.setExportBackgroundOverride,
      setConfirmBeforeDelete: state.setConfirmBeforeDelete,
    }))
  )

  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const exportBackgroundInputId = useId()

  const effectiveExportBg =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const storageMb = storageBytes / (1024 * 1024)
  const storageMaxMb = STORAGE_QUOTA_BYTES / (1024 * 1024)
  const storagePercent = Math.min((storageMb / storageMaxMb) * 100, 100)
  const storageColor =
    storagePercent > 85
      ? 'bg-[var(--t-destructive)]'
      : storagePercent > 60
        ? 'bg-[color-mix(in_srgb,var(--t-accent)_60%,var(--t-destructive))]'
        : 'bg-[var(--t-accent)]'

  return (
    <>
      <SettingsSection title="Export">
        <SettingRow label="Background Color">
          {(labelId) => (
            <div className="flex items-center gap-2">
              {exportBackgroundOverride !== null && (
                <button
                  type="button"
                  onClick={() => setExportBackgroundOverride(null)}
                  aria-label="Reset export background color to the theme default"
                  className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                  title="Reset to theme default"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <ColorInput
                id={exportBackgroundInputId}
                value={effectiveExportBg}
                onChange={(event) =>
                  setExportBackgroundOverride(event.target.value)
                }
                aria-labelledby={labelId}
              />
            </div>
          )}
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Data & Lists">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-sm text-[var(--t-text-faint)]">
            <Layers className="h-3.5 w-3.5" />
            {boards.length} {boards.length === 1 ? 'list' : 'lists'} saved
          </span>
          <SecondaryButton
            variant="surface"
            onClick={() => setShowPresetPicker(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New List
          </SecondaryButton>
        </div>
        <p className="mt-2 text-xs text-[var(--t-text-dim)]">
          Switch between lists using the button in the bottom-right corner.
        </p>

        <div className="my-2 border-t border-[var(--t-border)]" />

        <SettingRow label="Confirm Before Delete">
          <Toggle
            checked={confirmBeforeDelete}
            onChange={setConfirmBeforeDelete}
          />
        </SettingRow>

        <SecondaryButton
          variant="surface"
          tone="destructive"
          className="mt-1"
          onClick={onRequestClearAll}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All Items
        </SecondaryButton>

        <div className="mt-3 border-t border-[var(--t-border)] pt-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-[var(--t-text-faint)]">Storage</span>
            <span className="text-xs text-[var(--t-text-faint)]">
              {storageMb.toFixed(1)} MB / {storageMaxMb} MB
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--t-bg-active)]">
            <div
              className={`h-full rounded-full transition-all ${storageColor}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          {storagePercent > 85 && (
            <p className="mt-1.5 text-xs text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
              {STORAGE_NEAR_FULL_MESSAGE}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="Keyboard Shortcuts">
        <ShortcutsList className="space-y-2" />
      </SettingsSection>

      <section className="flex items-center justify-between px-1 py-2">
        <span className="text-xs text-[var(--t-text-dim)]">
          v{__APP_VERSION__}
        </span>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open the tierlistbuilder GitHub repository"
          className="text-[var(--t-text-faint)] transition-colors hover:text-[var(--t-text-muted)]"
        >
          <Github size={14} />
        </a>
      </section>

      <PresetPickerModal
        open={showPresetPicker}
        onClose={() => setShowPresetPicker(false)}
        onSelectPreset={(preset: TierPreset) =>
        {
          createBoardSessionFromPreset(preset)
          onClose()
        }}
        onSelectBlank={() =>
        {
          createBoardSession()
          onClose()
        }}
      />
    </>
  )
}
