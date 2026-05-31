// src/features/marketplace/ui/consensus/lib/useTierLabelPreferences.ts
// shared board-row preference selector for consensus tier surfaces

import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

export const useTierLabelPreferences = () =>
  usePreferencesStore(
    useShallow((state) => ({
      paletteId: state.paletteId,
      labelWidth: state.labelWidth,
      tierLabelBold: state.tierLabelBold,
      tierLabelItalic: state.tierLabelItalic,
      tierLabelFontSize: state.tierLabelFontSize,
      compactMode: state.compactMode,
    }))
  )
