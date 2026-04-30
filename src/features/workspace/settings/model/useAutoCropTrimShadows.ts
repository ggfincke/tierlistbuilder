// src/features/workspace/settings/model/useAutoCropTrimShadows.ts
// shared selector for the auto-crop trim-shadows preference + setter

import { useShallow } from 'zustand/react/shallow'

import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'

export interface AutoCropTrimShadows
{
  trimSoftShadows: boolean
  setTrimSoftShadows: (trim: boolean) => void
}

export const useAutoCropTrimShadows = (): AutoCropTrimShadows =>
  usePreferencesStore(
    useShallow((state) => ({
      trimSoftShadows: state.autoCropTrimSoftShadows,
      setTrimSoftShadows: state.setAutoCropTrimSoftShadows,
    }))
  )
