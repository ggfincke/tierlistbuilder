// src/features/workspace/imageEditor/model/LabelAwareEffectiveAspectMeasurements.tsx
// hidden measurement components for label-aware auto-crop.

import { useEffect, useMemo, useRef } from 'react'

import { placementFromMode } from '@tierlistbuilder/contracts/workspace/board'
import type { LabelBandVariant } from '~/shared/board-ui/labelBandVariant'
import type { ResolvedLabelDisplay } from '~/shared/board-ui/labelDisplay'
import { TileLayoutShell } from '~/shared/board-ui/TileLayoutShell'
import { useMeasuredElementSize } from '../lib/useMeasuredElementSize'

interface LabelAwareAspectMeasurementNodesProps
{
  entries: readonly { key: string; variant: LabelBandVariant }[]
  height: number
  measurementText: string
  onMeasured: (key: string, ar: number) => void
  shapeKey: string
  width: number
}

export const LabelAwareAspectMeasurementNodes = ({
  entries,
  height,
  measurementText,
  onMeasured,
  shapeKey,
  width,
}: LabelAwareAspectMeasurementNodesProps) => (
  <div
    aria-hidden
    style={{
      left: '-99999px',
      opacity: 0,
      pointerEvents: 'none',
      position: 'fixed',
      top: 0,
    }}
  >
    {entries.map(({ key, variant }) => (
      <HiddenMeasurementTile
        key={`${key}@${shapeKey}`}
        height={height}
        measurementText={measurementText}
        onMeasured={onMeasured}
        variant={variant}
        variantKey={key}
        width={width}
      />
    ))}
  </div>
)

interface HiddenMeasurementTileProps
{
  height: number
  measurementText: string
  onMeasured: (key: string, ar: number) => void
  variant: LabelBandVariant
  variantKey: string
  width: number
}

const HiddenMeasurementTile = ({
  height,
  measurementText,
  onMeasured,
  variant,
  variantKey,
  width,
}: HiddenMeasurementTileProps) =>
{
  const imageAreaRef = useRef<HTMLDivElement>(null)
  const imageAreaSize = useMeasuredElementSize(imageAreaRef, {
    width: 0,
    height: 0,
  })

  const display = useMemo<ResolvedLabelDisplay>(
    () => ({
      placement: placementFromMode(variant.placement),
      scrim: 'dark',
      fontSizePx: variant.fontSizePx,
      textStyleId: variant.textStyleId,
      textColor: 'auto',
      text: measurementText,
    }),
    [
      measurementText,
      variant.placement,
      variant.fontSizePx,
      variant.textStyleId,
    ]
  )

  useEffect(() =>
  {
    if (imageAreaSize.width <= 0 || imageAreaSize.height <= 0) return
    onMeasured(variantKey, imageAreaSize.width / imageAreaSize.height)
  }, [imageAreaSize, variantKey, onMeasured])

  return (
    <div style={{ width, height }}>
      <TileLayoutShell caption={display} imageAreaRef={imageAreaRef}>
        <div className="h-full w-full" />
      </TileLayoutShell>
    </div>
  )
}
