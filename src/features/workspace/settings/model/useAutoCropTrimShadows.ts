// src/features/workspace/settings/model/useAutoCropTrimShadows.ts
// shared selector for the auto-crop trim-shadows setting + setter

import { useShallow } from 'zustand/react/shallow'

import { useSettingsStore } from './useSettingsStore'

export interface AutoCropTrimShadows
{
  trimSoftShadows: boolean
  setTrimSoftShadows: (trim: boolean) => void
}

export const useAutoCropTrimShadows = (): AutoCropTrimShadows =>
  useSettingsStore(
    useShallow((state) => ({
      trimSoftShadows: state.autoCropTrimSoftShadows,
      setTrimSoftShadows: state.setAutoCropTrimSoftShadows,
    }))
  )
