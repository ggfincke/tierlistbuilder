// src/features/platform/sync/settingsCloudMerge.ts
// first-login merge for the global settings doc. silent — settings are
// cosmetic, no modal prompt. resolution rules (in order):
//
// 1. local has a pending unflushed edit (sidecar.pendingSyncAt set) & no
//    cloud row exists -> push local; the user just customized something
//    & we want to plant the cloud row from this device's state
//
// 2. local has a pending unflushed edit & cloud has a row -> push local;
//    user intent on this device wins over cross-device state. acceptable
//    risk: an unflushed edit on Device A made just before signing in on
//    Device B might be overwritten by Device B's push. rare; users can
//    re-customize. simpler than synthesizing a 3-way settings merge
//
// 3. cloud row exists, no pending local edit -> pull cloud (overwrite
//    local store). this is the "I just signed in on a new device" path
//
// 4. cloud row null, no pending local edit -> push local; cloud is empty
//    & local is whatever the defaults shook out to

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

// load AppSettings into the local store w/o tripping the subscriber. for
// the merge flow this matters: we don't want pulling cloud settings to
// re-queue a flush back to the cloud immediately. the caller is responsible
// for arming the subscriber AFTER the merge resolves so the store-load
// transition is invisible
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

  // pull path: cloud non-null & local has no pending edit. apply cloud over
  // local & stamp the sidecar so future flushes know cloud was the latest
  if (cloudSettings !== null && !hasPendingLocal)
  {
    applyAppSettingsToStore(cloudSettings)
    // we don't have the cloud's updatedAt from getMySettings (the query
    // returns just the settings blob), so use Date.now() as a reasonable
    // approximation. lastSyncedAt is only consumed by future merges to
    // decide direction & "now-ish" is good enough for that
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
