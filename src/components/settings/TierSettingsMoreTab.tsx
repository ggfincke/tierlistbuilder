// src/components/settings/TierSettingsMoreTab.tsx
// more tab content for export prefs, storage, lists, & shortcuts

import { useState } from 'react'
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
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { Toggle } from './Toggle'

interface TierSettingsMoreTabProps
{
  storageBytes: number
  onClose: () => void
  onRequestClearAll: () => void
}

const isMac =
  typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac')
const modKey = isMac ? 'Cmd' : 'Ctrl'

const SHORTCUTS = [
  { keys: [modKey, 'Z'], description: 'Undo' },
  { keys: [modKey, 'Shift', 'Z'], description: 'Redo' },
  {
    keys: ['Esc'],
    description: 'Close modal / cancel edit / exit keyboard mode',
  },
  { keys: ['Enter'], description: 'Confirm edit / submit' },
  { keys: ['Space'], description: 'Enter keyboard mode / pick up / drop' },
  { keys: ['Arrow Keys'], description: 'Browse items / move dragged item' },
]

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
                className="rounded p-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
                title="Reset to theme default"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              type="color"
              value={effectiveExportBg}
              onChange={(event) =>
                setExportBackgroundOverride(event.target.value)
              }
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
          <button
            type="button"
            onClick={() => setShowPresetPicker(true)}
            className="flex items-center gap-1.5 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm text-[var(--t-text)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)]"
          >
            <Plus className="h-3.5 w-3.5" />
            New List
          </button>
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

        <button
          type="button"
          onClick={onRequestClearAll}
          className="mt-1 flex items-center gap-1.5 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm text-[var(--t-destructive-hover)] hover:border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)] hover:bg-[color-mix(in_srgb,var(--t-destructive)_10%,transparent)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All Items
        </button>

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
        <div className="space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.description}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-sm text-[var(--t-text-secondary)]">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--t-text)]"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <section className="flex items-center justify-between px-1 py-2">
        <span className="text-xs text-[var(--t-text-dim)]">
          v{__APP_VERSION__}
        </span>
        <a
          href="https://github.com/ggfincke/tierlistbuilder"
          target="_blank"
          rel="noopener noreferrer"
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
