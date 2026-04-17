// src/features/platform/sync/progress/CloudPullProgressOverlay.tsx
// blocking first-login cloud-pull progress overlay — kept separate from
// useCloudPullProgressStore.ts so react-refresh treats this as component-only

import { ProgressOverlay } from '~/shared/overlay/ProgressOverlay'
import { useCloudPullProgressStore } from './useCloudPullProgressStore'

export const CloudPullProgressOverlay = () =>
{
  const { current, total } = useCloudPullProgressStore()

  if (total === 0)
  {
    return null
  }

  return (
    <ProgressOverlay
      title="Loading your boards"
      statusVerb="Downloading"
      progressLabel="Cloud pull progress"
      current={current}
      total={total}
    />
  )
}
