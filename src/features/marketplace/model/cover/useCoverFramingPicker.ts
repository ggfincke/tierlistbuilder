// src/features/marketplace/model/cover/useCoverFramingPicker.ts
// per-surface framing controller — tracks active surface + crop/zoom/frame per
// surface. cropper aspect is locked via SURFACE_ASPECT_RATIOS, no picker

import { useCallback, useMemo, useState } from 'react'

import {
  COVER_SURFACES,
  SURFACE_ASPECT_RATIOS,
  type CoverFrame,
  type CoverSurface,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'

interface SurfaceState
{
  crop: { x: number; y: number }
  zoom: number
  // committed frame in normalized source-image coords (0..1). null until the
  // surface gets a first onCropComplete (mount-time + on every adjust)
  frame: CoverFrame | null
}

interface UseCoverFramingPickerInput
{
  initialFraming?: TemplateCoverFraming | null
}

interface CoverFramingPicker
{
  activeSurface: CoverSurface
  setActiveSurface: (s: CoverSurface) => void
  active: SurfaceState
  // locked aspect for the active surface — drives the cropper rectangle
  activeAspect: number
  setActiveCrop: (next: { x: number; y: number }) => void
  setActiveZoom: (next: number) => void
  setActiveFrame: (frame: CoverFrame) => void
  // bulk-replace frames for all surfaces (auto-fit). resets crop/zoom so the
  // cropper picks up the new frame via initialCroppedAreaPercentages on remount
  applyFraming: (framing: TemplateCoverFraming) => void
  // bumps on each applyFraming so the cropper can key off it to remount &
  // re-seed initialCroppedAreaPercentages from the new active frame
  framingVersion: number
  framing: TemplateCoverFraming
}

const buildInitialSurfaceState = (
  initialFrame: CoverFrame | null
): SurfaceState => ({
  crop: { x: 0, y: 0 },
  zoom: 1,
  frame: initialFrame,
})

const buildInitialSurfaces = (
  initialFraming: TemplateCoverFraming | null | undefined
): Record<CoverSurface, SurfaceState> =>
  Object.fromEntries(
    COVER_SURFACES.map((surface) => [
      surface,
      buildInitialSurfaceState(initialFraming?.[surface] ?? null),
    ])
  ) as Record<CoverSurface, SurfaceState>

const coverFramesEqual = (
  a: CoverFrame | null,
  b: CoverFrame | null
): boolean =>
{
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

export const useCoverFramingPicker = ({
  initialFraming,
}: UseCoverFramingPickerInput): CoverFramingPicker =>
{
  const [surfaces, setSurfaces] = useState<Record<CoverSurface, SurfaceState>>(
    () => buildInitialSurfaces(initialFraming)
  )
  const [activeSurface, setActiveSurface] = useState<CoverSurface>(
    COVER_SURFACES[0]
  )
  const [framingVersion, setFramingVersion] = useState(0)

  const active = surfaces[activeSurface]
  const activeAspect = SURFACE_ASPECT_RATIOS[activeSurface]

  const updateActive = useCallback(
    (updater: (s: SurfaceState) => SurfaceState) =>
    {
      setSurfaces((prev) =>
      {
        const current = prev[activeSurface]
        const next = updater(current)
        if (next === current) return prev
        return { ...prev, [activeSurface]: next }
      })
    },
    [activeSurface]
  )

  const setActiveCrop = useCallback(
    (next: { x: number; y: number }) =>
    {
      updateActive((s) =>
      {
        if (s.crop.x === next.x && s.crop.y === next.y) return s
        return { ...s, crop: next }
      })
    },
    [updateActive]
  )

  const setActiveZoom = useCallback(
    (next: number) =>
    {
      updateActive((s) => (s.zoom === next ? s : { ...s, zoom: next }))
    },
    [updateActive]
  )

  const setActiveFrame = useCallback(
    (frame: CoverFrame) =>
    {
      updateActive((s) =>
        coverFramesEqual(s.frame, frame) ? s : { ...s, frame }
      )
    },
    [updateActive]
  )

  const applyFraming = useCallback((next: TemplateCoverFraming) =>
  {
    // reset crop/zoom for every surface so the cropper remounts (via
    // framingVersion key) & re-seeds from initialCroppedAreaPercentages
    setSurfaces(
      () =>
        Object.fromEntries(
          COVER_SURFACES.map((surface) => [
            surface,
            buildInitialSurfaceState(next[surface] ?? null),
          ])
        ) as Record<CoverSurface, SurfaceState>
    )
    setFramingVersion((v) => v + 1)
  }, [])

  const framing = useMemo<TemplateCoverFraming>(
    () => ({
      browseHero: surfaces.browseHero.frame,
      detailHero: surfaces.detailHero.frame,
      card: surfaces.card.frame,
    }),
    [surfaces]
  )

  return {
    activeSurface,
    setActiveSurface,
    active,
    activeAspect,
    setActiveCrop,
    setActiveZoom,
    setActiveFrame,
    applyFraming,
    framingVersion,
    framing,
  }
}
