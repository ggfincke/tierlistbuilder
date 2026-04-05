// src/components/settings/TierSettingsMoreTab.tsx
// more tab content for export prefs, storage, lists, & shortcuts

import { useId, useState } from 'react'
import { Github, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react'

import type { TierPreset } from '../../types'
import {
  createBoardSession,
  createBoardSessionFromPreset,
} from '../../services/boardSession'
import { useBoardManagerStore } from '../../store/useBoardManagerStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { THEMES } from '../../theme/tokens'
import { PresetPickerModal } from '../ui/PresetPickerModal'
import { SecondaryButton } from '../ui/SecondaryButton'
import { ShortcutsList } from '../ui/ShortcutsList'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { Toggle } from './Toggle'

interface TierSettingsMoreTabProps
{
  storageBytes: number
  onClose: () => void
  onRequestClearAll: () => void
}

export const TierSettingsMoreTab = ({
  storageBytes,
  onClose,
  onRequestClearAll,
}: TierSettingsMoreTabProps) =>
{
  const boards = useBoardManagerStore((state) => state.boards)
  const exportBackgroundOverride = useSettingsStore(
    (state) => state.exportBackgroundOverride
  )
  const themeId = useSettingsStore((state) => state.themeId)
  const confirmBeforeDelete = useSettingsStore(
    (state) => state.confirmBeforeDelete
  )
  const setExportBackgroundOverride = useSettingsStore(
    (state) => state.setExportBackgroundOverride
  )
  const setConfirmBeforeDelete = useSettingsStore(
    (state) => state.setConfirmBeforeDelete
  )

  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const exportBackgroundInputId = useId()

  const effectiveExportBg =
    exportBackgroundOverride ?? THEMES[themeId]['export-bg']
  const storageMb = storageBytes / (1024 * 1024)
  const storageMaxMb = 5
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
            <input
              id={exportBackgroundInputId}
              type="color"
              value={effectiveExportBg}
              onChange={(event) =>
                setExportBackgroundOverride(event.target.value)
              }
              aria-label="Export background color"
              className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
            />
          </div>
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
          href="https://github.com/ggfincke/tierlistbuilder"
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
