// src/features/workspace/export/ui/ExportProgressOverlay.tsx
// export progress overlay

import { ProgressOverlay } from '~/shared/overlay/ProgressOverlay'

interface ExportProgressOverlayProps
{
  current: number
  total: number
}

export const ExportProgressOverlay = ({
  current,
  total,
}: ExportProgressOverlayProps) => (
  <ProgressOverlay
    title="Exporting Boards"
    statusVerb="Exporting"
    progressLabel="Export progress"
    current={current}
    total={total}
  />
)
