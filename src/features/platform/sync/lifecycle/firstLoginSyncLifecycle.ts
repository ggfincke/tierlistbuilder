// src/features/platform/sync/lifecycle/firstLoginSyncLifecycle.ts
// first-login sync orchestration — run the board merge first, then arm
// board/settings/preset sync paths as each merge settles

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
  await runBoardMerge()
  if (!shouldProceed())
  {
    return
  }

  onBoardMergeSettled()

  await Promise.allSettled([
    runAuxiliaryMerge(runSettingsMerge, onSettingsMergeSettled, shouldProceed),
    runAuxiliaryMerge(runPresetMerge, onPresetMergeSettled, shouldProceed),
  ])
}
