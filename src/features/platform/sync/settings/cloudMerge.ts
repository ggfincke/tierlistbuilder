// src/features/platform/sync/settings/cloudMerge.ts
// first-login settings merge — silent. pending local edit -> push local;
// cloud row & no pending edit -> pull cloud; otherwise -> push local defaults

import type { AppSettings } from '@tierlistbuilder/contracts/workspace/settings'
import {
  getMySettingsImperative,
  upsertMySettingsImperative,
} from '~/features/workspace/settings/data/cloud/settingsRepository'
import {
  loadSettingsSyncMetaForUser,
  markSettingsSynced,
} from '~/features/workspace/settings/data/local/settingsSyncMeta'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'

export type SettingsMergeResult =
  | { kind: 'push'; updatedAt: number }
  | { kind: 'pull'; updatedAt: number }
  | { kind: 'noop' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: unknown }

interface MergeSettingsOptions
{
  userId: string
  shouldProceed?: () => boolean
}

// extract the AppSettings fields from the store. the store extends AppSettings
// w/ setter functions; we need to peel those off before pushing to the cloud
const extractAppSettingsFromStore = (): AppSettings =>
{
  const state = useSettingsStore.getState()
  return {
    itemSize: state.itemSize,
    showLabels: state.showLabels,
    itemShape: state.itemShape,
    compactMode: state.compactMode,
    exportBackgroundOverride: state.exportBackgroundOverride,
    boardBackgroundOverride: state.boardBackgroundOverride,
    labelWidth: state.labelWidth,
    hideRowControls: state.hideRowControls,
    confirmBeforeDelete: state.confirmBeforeDelete,
    themeId: state.themeId,
    paletteId: state.paletteId,
    textStyleId: state.textStyleId,
    tierLabelBold: state.tierLabelBold,
    tierLabelItalic: state.tierLabelItalic,
    tierLabelFontSize: state.tierLabelFontSize,
    boardLocked: state.boardLocked,
    reducedMotion: state.reducedMotion,
    preHighContrastThemeId: state.preHighContrastThemeId,
    preHighContrastPaletteId: state.preHighContrastPaletteId,
    toolbarPosition: state.toolbarPosition,
    showAltTextButton: state.showAltTextButton,
  }
}

// load AppSettings into the store w/o tripping the subscriber — caller arms
// the subscriber AFTER merge resolves so this store-load is invisible
const applyAppSettingsToStore = (settings: AppSettings): void =>
{
  // useSettingsStore's setState merges into the existing state, preserving
  // the setter functions. we pass the AppSettings fields directly
  useSettingsStore.setState(settings)
}

const shouldContinue = (shouldProceed?: () => boolean): boolean =>
  shouldProceed ? shouldProceed() : true

export const mergeSettingsOnFirstLogin = async ({
  userId,
  shouldProceed,
}: MergeSettingsOptions): Promise<SettingsMergeResult> =>
{
  if (!shouldContinue(shouldProceed))
  {
    return { kind: 'aborted' }
  }

  let cloudSettings: AppSettings | null
  try
  {
    cloudSettings = await getMySettingsImperative()
  }
  catch (error)
  {
    return { kind: 'error', error }
  }

  if (!shouldContinue(shouldProceed))
  {
    return { kind: 'aborted' }
  }

  const sidecar = loadSettingsSyncMetaForUser(userId)
  const hasPendingLocal = sidecar.pendingSyncAt !== null

  // pull path: cloud non-null & local has no pending edit. apply cloud &
  // stamp the sidecar so future flushes know cloud was latest
  if (cloudSettings !== null && !hasPendingLocal)
  {
    applyAppSettingsToStore(cloudSettings)
    // getMySettings returns just the blob, not updatedAt; use Date.now() as
    // a reasonable approximation (only consumed by future merge direction logic)
    const meta = markSettingsSynced(userId, Date.now())
    return { kind: 'pull', updatedAt: meta.lastSyncedAt ?? Date.now() }
  }

  // push path: either cloud is empty, or local has pending edits we don't
  // want to lose. send the local state up
  const localSettings = extractAppSettingsFromStore()
  try
  {
    const result = await upsertMySettingsImperative({ settings: localSettings })
    if (!shouldContinue(shouldProceed))
    {
      return { kind: 'aborted' }
    }
    markSettingsSynced(userId, result.updatedAt)
    return { kind: 'push', updatedAt: result.updatedAt }
  }
  catch (error)
  {
    return { kind: 'error', error }
  }
}
