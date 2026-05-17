// src/features/workspace/settings/ui/aspect-ratio/BulkFitSegmentedControl.tsx
// cover/contain/auto-crop segmented control for the ratio issue prompt

import { Check, Crop, Loader2 } from 'lucide-react'
import { useCallback, type ReactNode } from 'react'

import type { ImageFit } from '@tierlistbuilder/contracts/workspace/board'
import { SegmentedControl } from '~/shared/ui/settings/SegmentedControl'

type BulkFitMode = ImageFit | 'auto-crop'

interface AutoCropSegmentState
{
  autoCropAvailable: boolean
  autoCropApplied: boolean
  autoCropPreparing: boolean
  autoCropRunning: boolean
}

interface BulkFitSegmentedControlProps
{
  pendingBulkFit: ImageFit | null
  autoCropApplied: boolean
  autoCropSelected: boolean
  autoCropPreparing: boolean
  autoCropRunning: boolean
  autoCropAvailable: boolean
  onSelectFit: (fit: ImageFit) => void
  onSelectAutoCrop: () => void
}

// reserve widest label width so the segment doesn't jitter across states
const renderAutoCropLabel = (icon: ReactNode, text: string): ReactNode => (
  <span className="relative inline-flex items-center justify-center">
    <span
      aria-hidden="true"
      className="invisible inline-flex items-center gap-1"
    >
      <Check className="h-3 w-3" />
      Auto-cropped all
    </span>
    <span className="absolute inset-0 inline-flex items-center justify-center gap-1">
      {icon}
      {text}
    </span>
  </span>
)

const getAutoCropLabel = ({
  autoCropApplied,
  autoCropPreparing,
  autoCropRunning,
}: AutoCropSegmentState): ReactNode =>
{
  if (autoCropPreparing || autoCropRunning)
  {
    return renderAutoCropLabel(
      <Loader2 className="h-3 w-3 animate-spin" />,
      'Auto-crop all'
    )
  }
  if (autoCropApplied)
  {
    return renderAutoCropLabel(
      <Check className="h-3 w-3" />,
      'Auto-cropped all'
    )
  }
  return renderAutoCropLabel(<Crop className="h-3 w-3" />, 'Auto-crop all')
}

const getAutoCropTitle = ({
  autoCropAvailable,
  autoCropApplied,
  autoCropPreparing,
}: AutoCropSegmentState): string =>
{
  if (autoCropPreparing) return 'Waiting for imported image bytes'
  if (autoCropApplied) return 'Auto-crop is applied'
  if (!autoCropAvailable) return 'No image bytes available to auto-crop'
  return 'Frame detected content for mismatched items'
}

// 3-segment control unifying Cover / Contain / Auto-crop. Cover & Contain
// stay pending until Done (which strips any prior transform via
// setItemsImageFit). Auto-crop runs immediately since detection is async
export const BulkFitSegmentedControl = ({
  pendingBulkFit,
  autoCropApplied,
  autoCropSelected,
  autoCropPreparing,
  autoCropRunning,
  autoCropAvailable,
  onSelectFit,
  onSelectAutoCrop,
}: BulkFitSegmentedControlProps) =>
{
  // pendingBulkFit (Cover/Contain) wins over the auto-crop selected state so
  // the user's most recent intent is what the highlight reflects
  const value: BulkFitMode | null =
    pendingBulkFit ??
    (autoCropSelected || autoCropPreparing ? 'auto-crop' : null)

  const handleChange = useCallback(
    (next: BulkFitMode) =>
    {
      if (next === 'auto-crop') onSelectAutoCrop()
      else onSelectFit(next)
    },
    [onSelectAutoCrop, onSelectFit]
  )

  const autoCropState = {
    autoCropAvailable,
    autoCropApplied,
    autoCropPreparing,
    autoCropRunning,
  }
  const autoCropLabel = getAutoCropLabel(autoCropState)

  return (
    <SegmentedControl<BulkFitMode>
      ariaLabel="Bulk image fit"
      value={value}
      onChange={handleChange}
      options={[
        { value: 'cover', label: 'Cover all' },
        { value: 'contain', label: 'Contain all' },
        {
          value: 'auto-crop',
          label: autoCropLabel,
          // applied state stays selected but unclickable so re-pressing
          // doesn't re-run detection on already-cropped items
          disabled:
            !autoCropAvailable ||
            autoCropPreparing ||
            autoCropRunning ||
            autoCropApplied,
          ariaLabel: autoCropApplied
            ? 'Auto-crop applied to mismatched items'
            : 'Auto-crop all mismatched items',
          title: getAutoCropTitle(autoCropState),
        },
      ]}
    />
  )
}
