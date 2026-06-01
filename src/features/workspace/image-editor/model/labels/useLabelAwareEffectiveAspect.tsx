// src/features/workspace/image-editor/model/labels/useLabelAwareEffectiveAspect.tsx
// measures post-caption image area aspect ratios for auto-crop.

import { useCallback, useMemo, useState, type ReactNode } from 'react'

import type { ItemSize } from '@tierlistbuilder/contracts/platform/preferences'
import { itemSlotDimensions } from '~/shared/board-ui/constants'
import {
  labelBandVariantKey,
  type LabelBandVariant,
} from '~/shared/board-ui/labelBandVariant'
import { LabelAwareAspectMeasurementNodes } from '~/features/workspace/image-editor/model/labels/LabelAwareEffectiveAspectMeasurements'

// covers ascenders/descenders while staying short enough to avoid wrapping
const MEASUREMENT_PLACEHOLDER_TEXT = 'Aj Mg'
const EMPTY_AR_BY_KEY: ReadonlyMap<string, number> = new Map()

interface AspectRatioMeasurementState
{
  shapeKey: string
  arByKey: ReadonlyMap<string, number>
}

interface UseLabelAwareEffectiveAspectInput
{
  boardAspectRatio: number
  itemSize: ItemSize
  variants: readonly LabelBandVariant[]
}

interface UseLabelAwareEffectiveAspectOutput
{
  // null variant returns boardAspectRatio (no band, no measurement needed)
  getEffectiveAspectRatio: (variant: LabelBandVariant | null) => number
  measurementsReady: boolean
  // Mount in consumer tree to render hidden tiles offscreen.
  measurementNodes: ReactNode
}

export const useLabelAwareEffectiveAspect = ({
  boardAspectRatio,
  itemSize,
  variants,
}: UseLabelAwareEffectiveAspectInput): UseLabelAwareEffectiveAspectOutput =>
{
  // Dedupe variants: measurement tiles are 1-per-key, not 1-per-item.
  const distinctVariants = useMemo(() =>
  {
    const seen = new Map<string, LabelBandVariant>()
    for (const variant of variants)
    {
      const key = labelBandVariantKey(variant)
      if (!seen.has(key)) seen.set(key, variant)
    }
    return [...seen].map(([key, variant]) => ({ key, variant }))
  }, [variants])

  const shapeKey = `${itemSize}:${boardAspectRatio}`
  const [measurements, setMeasurements] = useState<AspectRatioMeasurementState>(
    () => ({
      shapeKey,
      arByKey: new Map(),
    })
  )
  const activeArByKey = useMemo(
    () =>
      measurements.shapeKey === shapeKey
        ? measurements.arByKey
        : EMPTY_AR_BY_KEY,
    [measurements, shapeKey]
  )

  const handleMeasured = useCallback(
    (key: string, ar: number) =>
    {
      setMeasurements((prev) =>
      {
        const base =
          prev.shapeKey === shapeKey ? prev.arByKey : new Map<string, number>()
        const existing = base.get(key)
        if (existing !== undefined && Math.abs(existing - ar) < 0.0005)
        {
          return prev
        }
        const next = new Map(base)
        next.set(key, ar)
        return { shapeKey, arByKey: next }
      })
    },
    [shapeKey]
  )

  const slot = itemSlotDimensions(itemSize, boardAspectRatio)

  const measurementNodes = (
    <LabelAwareAspectMeasurementNodes
      entries={distinctVariants}
      height={slot.height}
      measurementText={MEASUREMENT_PLACEHOLDER_TEXT}
      onMeasured={handleMeasured}
      shapeKey={shapeKey}
      width={slot.width}
    />
  )

  const measurementsReady = distinctVariants.every(({ key }) =>
    activeArByKey.has(key)
  )

  const getEffectiveAspectRatio = useCallback(
    (variant: LabelBandVariant | null): number =>
    {
      if (!variant) return boardAspectRatio
      return activeArByKey.get(labelBandVariantKey(variant)) ?? boardAspectRatio
    },
    [activeArByKey, boardAspectRatio]
  )

  return { getEffectiveAspectRatio, measurementsReady, measurementNodes }
}
