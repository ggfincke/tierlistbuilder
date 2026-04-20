// src/features/platform/sync/orchestration/firstLoginSyncLifecycle.ts
// first-login sync orchestration; runs board merge first & arms remaining sync paths

import { logger } from '~/shared/lib/logger'

interface FirstLoginSyncLifecycleOptions
{
  shouldProceed: () => boolean
  runBoardMerge: () => Promise<void>
  runSettingsMerge: () => Promise<unknown>
  runPresetMerge: () => Promise<unknown>
  onBoardMergeSettled: () => void
  onSettingsMergeSettled: () => void
  onPresetMergeSettled: () => void
}

const runAuxiliaryMerge = async (
  runMerge: () => Promise<unknown>,
  onSettled: () => void,
  shouldProceed: () => boolean
): Promise<void> =>
{
  try
  {
    await runMerge()
  }
  finally
  {
    if (shouldProceed())
    {
      onSettled()
    }
  }
}

export const runFirstLoginSyncLifecycle = async ({
  shouldProceed,
  runBoardMerge,
  runSettingsMerge,
  runPresetMerge,
  onBoardMergeSettled,
  onSettingsMergeSettled,
  onPresetMergeSettled,
}: FirstLoginSyncLifecycleOptions): Promise<void> =>
{
  // try/finally ensures onBoardMergeSettled fires on runBoardMerge throw —
  // without it boardFirstLoginMergeRef would stick at true & permanently
  // block the active-store subscriber from queuing future edits
  let boardMergeThrew: unknown = null
  try
  {
    await runBoardMerge()
  }
  catch (error)
  {
    boardMergeThrew = error
  }
  finally
  {
    if (shouldProceed())
    {
      onBoardMergeSettled()
    }
  }

  if (boardMergeThrew !== null)
  {
    logger.warn('sync', 'First-login board merge threw:', boardMergeThrew)
  }

  if (!shouldProceed())
  {
    return
  }

  await Promise.allSettled([
    runAuxiliaryMerge(runSettingsMerge, onSettingsMergeSettled, shouldProceed),
    runAuxiliaryMerge(runPresetMerge, onPresetMergeSettled, shouldProceed),
  ])
}
