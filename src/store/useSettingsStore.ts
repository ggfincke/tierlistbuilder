// src/store/useSettingsStore.ts
// * global settings store — user preferences persisted independently of per-board data
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { AppSettings, ItemShape, ItemSize, LabelWidth } from '../types'
import { EXPORT_BACKGROUND_COLOR, SETTINGS_STORAGE_KEY } from '../utils/constants'

const DEFAULT_SETTINGS: AppSettings = {
  itemSize: 'medium',
  showLabels: false,
  itemShape: 'square',
  compactMode: false,
  exportBackgroundColor: EXPORT_BACKGROUND_COLOR,
  labelWidth: 'default',
  hideRowControls: false,
  confirmBeforeDelete: false,
}

interface SettingsStore extends AppSettings {
  setItemSize: (size: ItemSize) => void
  setShowLabels: (show: boolean) => void
  setItemShape: (shape: ItemShape) => void
  setCompactMode: (compact: boolean) => void
  setExportBackgroundColor: (color: string) => void
  setLabelWidth: (width: LabelWidth) => void
  setHideRowControls: (hide: boolean) => void
  setConfirmBeforeDelete: (confirm: boolean) => void
  resetSettings: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setItemSize: (itemSize) => set({ itemSize }),
      setShowLabels: (showLabels) => set({ showLabels }),
      setItemShape: (itemShape) => set({ itemShape }),
      setCompactMode: (compactMode) => set({ compactMode }),
      setExportBackgroundColor: (exportBackgroundColor) => set({ exportBackgroundColor }),
      setLabelWidth: (labelWidth) => set({ labelWidth }),
      setHideRowControls: (hideRowControls) => set({ hideRowControls }),
      setConfirmBeforeDelete: (confirmBeforeDelete) => set({ confirmBeforeDelete }),
      resetSettings: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
