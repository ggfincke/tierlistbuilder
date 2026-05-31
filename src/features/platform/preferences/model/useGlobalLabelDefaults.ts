// src/features/platform/preferences/model/useGlobalLabelDefaults.ts
// resolved global caption defaults shared by board tiles & editor surfaces

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { GlobalLabelDefaults } from '@tierlistbuilder/contracts/workspace/board'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

export const useGlobalLabelDefaults = (): GlobalLabelDefaults =>
{
  const { showLabels, defaultLabelPlacementMode, defaultLabelFontSizePx } =
    usePreferencesStore(
      useShallow((state) => ({
        showLabels: state.showLabels,
        defaultLabelPlacementMode: state.defaultLabelPlacementMode,
        defaultLabelFontSizePx: state.defaultLabelFontSizePx,
      }))
    )

  return useMemo<GlobalLabelDefaults>(
    () => ({
      showLabels,
      placementMode: defaultLabelPlacementMode,
      fontSizePx: defaultLabelFontSizePx,
    }),
    [showLabels, defaultLabelPlacementMode, defaultLabelFontSizePx]
  )
}
