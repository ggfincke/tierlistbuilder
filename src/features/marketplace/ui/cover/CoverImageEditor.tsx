// src/features/marketplace/ui/cover/CoverImageEditor.tsx
// per-surface framing editor — author crops each surface (browse hero / detail
// hero / card) independently w/ a cropper locked to the surface's canonical ratio

import { Loader2, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Cropper, {
  type Area,
  type MediaSize,
  type Point,
  type Size,
} from 'react-easy-crop'

import {
  COVER_SURFACES,
  SURFACE_ASPECT_RATIOS,
  type CoverFrame,
  type CoverSurface,
  type TemplateCoverFraming,
} from '@tierlistbuilder/contracts/marketplace/template'

import {
  bboxToCoverFraming,
  scanCoverImage,
} from '~/features/marketplace/model/cover/coverAutoCrop'
import { computeFramedPlacement } from '~/shared/board-ui/coverFramingPlacement'
import { useCoverFramingPicker } from '~/features/marketplace/model/cover/useCoverFramingPicker'
import { applyAxisSnap } from '~/shared/lib/axisSnap'
import { formatError } from '~/shared/lib/errors'
import { logger } from '~/shared/lib/logger'
import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

import { coverFramePlacementStyle } from '~/shared/board-ui/coverFramingStyles'

interface SourceMeta
{
  url: string
  width: number
  height: number
}

interface CoverImageEditorProps
{
  open: boolean
  // either a freshly picked file (new upload) or an already-uploaded master
  // (re-cropping an existing template's cover w/o re-uploading)
  source:
    | { kind: 'file'; file: File }
    | { kind: 'existing'; url: string; width: number; height: number }
  initialFraming?: TemplateCoverFraming | null
  onCancel: () => void
  // framing always returned. file present iff source.kind === 'file'
  onApply: (framing: TemplateCoverFraming, file?: File) => void
}

interface CoverImageEditorBodyProps
{
  source: CoverImageEditorProps['source']
  initialFraming: TemplateCoverFraming | null
  onCancel: () => void
  onApply: (framing: TemplateCoverFraming, file?: File) => void
}

// minZoom < 1 lets authors shrink a wider/taller-than-surface source so the
// whole image fits inside the crop rect, w/ the matte showing as letterbox bars
const ZOOM_MIN = 0.3
const ZOOM_MAX = 6
const ZOOM_STEP = 0.05

// snap threshold in container pixels. tuned higher than the workspace pane's
// 5px since the cover cropper sits in a much larger surface — wider arcs of
// movement need a wider catch zone to feel decisive
const SNAP_THRESHOLD_PX = 12

// surface tile widths picked for visual hierarchy: browse hero biggest, detail
// hero mid, card smallest. heights derived from SURFACE_ASPECT_RATIOS so the
// preview rendering exactly matches the cropper's locked aspect for each surface
const SURFACE_TILE_WIDTH: Record<CoverSurface, number> = {
  browseHero: 320,
  detailHero: 280,
  card: 224,
}

const SURFACE_LABELS: Record<CoverSurface, string> = {
  browseHero: 'Browse hero',
  detailHero: 'Detail hero',
  card: 'Card thumbnail',
}

const SURFACE_PRESENTATION: ReadonlyArray<{
  id: CoverSurface
  label: string
  width: number
  height: number
}> = COVER_SURFACES.map((id) => ({
  id,
  label: SURFACE_LABELS[id],
  width: SURFACE_TILE_WIDTH[id],
  height: Math.round(SURFACE_TILE_WIDTH[id] / SURFACE_ASPECT_RATIOS[id]),
}))

const sourceKey = (source: CoverImageEditorProps['source']): string =>
{
  if (source.kind === 'file')
  {
    return `file:${source.file.name}:${source.file.size}:${source.file.lastModified}`
  }
  return `existing:${source.url}`
}

// outer wrapper — keying on source identity remounts the body w/ fresh state
// whenever the user picks a different image. closes the door on stale crop /
// blob-URL state w/o needing a setState-in-effect cleanup
export const CoverImageEditor = ({
  open,
  source,
  initialFraming,
  onCancel,
  onApply,
}: CoverImageEditorProps) =>
{
  if (!open) return null
  return (
    <CoverImageEditorBody
      key={sourceKey(source)}
      source={source}
      initialFraming={initialFraming ?? null}
      onCancel={onCancel}
      onApply={onApply}
    />
  )
}

const CoverImageEditorBody = ({
  source,
  initialFraming,
  onCancel,
  onApply,
}: CoverImageEditorBodyProps) =>
{
  const titleId = useId()
  const [meta, setMeta] = useState<SourceMeta | null>(() =>
  {
    if (source.kind === 'existing')
    {
      return { url: source.url, width: source.width, height: source.height }
    }
    return null
  })
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [autoFitting, setAutoFitting] = useState(false)
  const [autoFitError, setAutoFitError] = useState<string | null>(null)
  const [trimSoftShadows, setTrimSoftShadows] = useState(true)
  const [snap, setSnap] = useState<{ x: boolean; y: boolean }>({
    x: false,
    y: false,
  })
  // mediaSize from onMediaLoaded = rendered dims at zoom=1 inside the cropper
  // container (objectFit=contain). cropSize from onCropSizeChange = actual crop
  // rect dims (cropper bounds it by min(media, container) — not just container)
  const mediaSizeRef = useRef<MediaSize | null>(null)
  const cropSizeRef = useRef<Size | null>(null)
  const skippedInitialAreaBySurface = useRef<
    Partial<Record<CoverSurface, boolean>>
  >({})

  // probe natural dims for newly picked files. existing sources skip this
  useEffect(() =>
  {
    if (source.kind !== 'file') return
    let cancelled = false
    const url = URL.createObjectURL(source.file)
    const probe = new Image()
    probe.onload = () =>
    {
      if (cancelled) return
      setMeta({ url, width: probe.naturalWidth, height: probe.naturalHeight })
    }
    probe.onerror = () =>
    {
      if (cancelled) return
      logger.warn('marketplace', 'cover image probe failed')
      setMeta(null)
    }
    probe.src = url

    return () =>
    {
      cancelled = true
      URL.revokeObjectURL(url)
    }
  }, [source])

  const picker = useCoverFramingPicker({ initialFraming })
  const framingVersion = picker.framingVersion

  // every applyFraming bumps framingVersion -> cropper remounts via key. reset
  // the per-surface "skip first onCropAreaChange" guard so the just-applied
  // frame isn't immediately overwritten by the cropper's first re-emit
  useEffect(() =>
  {
    skippedInitialAreaBySurface.current = {}
  }, [framingVersion])

  const handleCropAreaChange = useCallback(
    (area: Area, _areaPixels: Area) =>
    {
      const initialFrame = picker.active.frame
      if (
        initialFrame &&
        !skippedInitialAreaBySurface.current[picker.activeSurface]
      )
      {
        skippedInitialAreaBySurface.current[picker.activeSurface] = true
        return
      }
      const frame = cropAreaToFrame(area)
      if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height))
        return
      picker.setActiveFrame(frame)
    },
    [picker]
  )

  // intercept crop offset -> snap to center & image edges (in container
  // coords). center snap shows a guide; edge snaps don't. edge candidates
  // only added when the image is larger than the crop rect on that axis
  const handleCropChange = useCallback(
    (point: Point) =>
    {
      const media = mediaSizeRef.current
      const cropSize = cropSizeRef.current
      if (!media || !cropSize)
      {
        setSnap((prev) => (prev.x || prev.y ? { x: false, y: false } : prev))
        picker.setActiveCrop(point)
        return
      }
      const renderedW = media.width * picker.active.zoom
      const renderedH = media.height * picker.active.zoom

      const candidatesX: { value: number; guide: boolean }[] = [
        { value: 0, guide: true },
      ]
      if (renderedW > cropSize.width)
      {
        const edge = (renderedW - cropSize.width) / 2
        candidatesX.push({ value: edge, guide: false })
        candidatesX.push({ value: -edge, guide: false })
      }
      const candidatesY: { value: number; guide: boolean }[] = [
        { value: 0, guide: true },
      ]
      if (renderedH > cropSize.height)
      {
        const edge = (renderedH - cropSize.height) / 2
        candidatesY.push({ value: edge, guide: false })
        candidatesY.push({ value: -edge, guide: false })
      }
      const snappedX = applyAxisSnap(point.x, SNAP_THRESHOLD_PX, candidatesX)
      const snappedY = applyAxisSnap(point.y, SNAP_THRESHOLD_PX, candidatesY)
      setSnap((prev) =>
        prev.x === snappedX.guide && prev.y === snappedY.guide
          ? prev
          : { x: snappedX.guide, y: snappedY.guide }
      )
      picker.setActiveCrop({ x: snappedX.value, y: snappedY.value })
    },
    [picker]
  )

  const handleMediaLoaded = useCallback((size: MediaSize) =>
  {
    mediaSizeRef.current = size
  }, [])

  const handleCropSizeChange = useCallback((size: Size) =>
  {
    cropSizeRef.current = size
  }, [])

  const handleInteractionEnd = useCallback(() =>
  {
    setSnap((prev) => (prev.x || prev.y ? { x: false, y: false } : prev))
  }, [])

  const handleAutoFit = useCallback(async () =>
  {
    if (!meta || autoFitting) return
    setAutoFitting(true)
    setAutoFitError(null)
    try
    {
      const scanSource =
        source.kind === 'file'
          ? ({ kind: 'file', file: source.file } as const)
          : ({ kind: 'existing', url: meta.url } as const)
      const bbox = await scanCoverImage({
        source: scanSource,
        trimSoftShadows,
      })
      if (!bbox)
      {
        setAutoFitError(
          'Could not detect a clear subject — try cropping manually.'
        )
        return
      }
      const next = bboxToCoverFraming({
        bbox,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
      })
      picker.applyFraming(next)
    }
    catch (error)
    {
      logger.warn('marketplace', 'cover auto-fit failed', error)
      setAutoFitError(formatError(error, 'Auto-fit failed.'))
    }
    finally
    {
      setAutoFitting(false)
    }
  }, [autoFitting, meta, picker, source, trimSoftShadows])

  const handleApply = useCallback(() =>
  {
    if (!meta || applying) return
    setApplying(true)
    setApplyError(null)
    try
    {
      const file = source.kind === 'file' ? source.file : undefined
      onApply(picker.framing, file)
    }
    catch (error)
    {
      logger.warn('marketplace', 'cover framing apply failed', error)
      setApplyError(
        formatError(error, 'Failed to apply framing. Please try again.')
      )
      setApplying(false)
    }
  }, [meta, applying, source, onApply, picker.framing])

  const activeLabel = SURFACE_LABELS[picker.activeSurface]

  return (
    <BaseModal
      open
      onClose={applying ? undefined : onCancel}
      labelledBy={titleId}
      panelClassName="flex flex-col p-0"
      panelStyle={{
        height: 'min(880px, calc(100dvh - 4rem))',
        maxWidth: 'none',
        overflowY: 'hidden',
        width: 'min(1120px, calc(100vw - 4rem))',
      }}
      closeOnBackdrop={!applying}
      closeOnEscape={!applying}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <ModalHeader titleId={titleId}>Frame your cover</ModalHeader>
          <span className="text-xs text-[var(--t-text-faint)]">
            for{' '}
            <span className="text-[var(--t-text-secondary)]">
              {activeLabel}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--t-text-muted)]">
            <input
              type="checkbox"
              checked={trimSoftShadows}
              onChange={(e) => setTrimSoftShadows(e.target.checked)}
              disabled={autoFitting || !meta}
              className="h-3 w-3 cursor-pointer accent-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            />
            Trim soft shadows
          </label>
          <SecondaryButton
            type="button"
            size="sm"
            onClick={handleAutoFit}
            disabled={autoFitting || !meta}
          >
            {autoFitting ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                Scanning…
              </>
            ) : (
              <>
                <Wand2 className="h-3 w-3" strokeWidth={1.8} />
                Auto-fit
              </>
            )}
          </SecondaryButton>
        </div>
      </header>
      {autoFitError && (
        <div
          role="alert"
          className="shrink-0 border-b border-[var(--t-border-secondary)] px-5 py-1.5 text-[11px] text-[var(--t-destructive-hover)]"
        >
          {autoFitError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          {meta ? (
            <div className="relative min-h-[320px] w-full flex-1 overflow-hidden rounded-lg border border-[var(--t-border-secondary)] bg-black">
              <Cropper
                key={`${picker.activeSurface}:${framingVersion}`}
                image={meta.url}
                crop={picker.active.crop}
                zoom={picker.active.zoom}
                minZoom={ZOOM_MIN}
                maxZoom={ZOOM_MAX}
                aspect={picker.activeAspect}
                showGrid
                objectFit="contain"
                restrictPosition={false}
                initialCroppedAreaPercentages={frameToCropArea(
                  picker.active.frame
                )}
                onCropChange={handleCropChange}
                onZoomChange={picker.setActiveZoom}
                onCropAreaChange={handleCropAreaChange}
                onCropSizeChange={handleCropSizeChange}
                onMediaLoaded={handleMediaLoaded}
                onInteractionEnd={handleInteractionEnd}
              />
              {snap.x && <SnapGuide axis="x" />}
              {snap.y && <SnapGuide axis="y" />}
            </div>
          ) : (
            <div className="flex min-h-[320px] w-full flex-1 items-center justify-center rounded-lg border border-[var(--t-border-secondary)] bg-[var(--t-bg-sunken)] text-sm text-[var(--t-text-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={2} />
              Loading image…
            </div>
          )}

          <ZoomSlider
            zoom={picker.active.zoom}
            onChange={picker.setActiveZoom}
            disabled={!meta}
          />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--t-text-faint)]">
            Surfaces
          </h3>
          {meta ? (
            <SurfaceTiles
              source={meta}
              framing={picker.framing}
              activeSurface={picker.activeSurface}
              onSelect={picker.setActiveSurface}
            />
          ) : (
            <p className="text-[11px] text-[var(--t-text-faint)]">
              Loading surface previews…
            </p>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-[var(--t-border)] px-5 py-3">
        {applyError && (
          <p
            role="alert"
            className="mb-2 text-xs text-[var(--t-destructive-hover)]"
          >
            {applyError}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <SecondaryButton type="button" onClick={onCancel} disabled={applying}>
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="button"
            size="md"
            onClick={handleApply}
            disabled={applying || !meta}
          >
            {applying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                Applying…
              </>
            ) : (
              'Apply'
            )}
          </PrimaryButton>
        </div>
      </footer>
    </BaseModal>
  )
}

// thin alignment guide overlay that lights up when crop offset snaps to the
// container center on its axis. mirrors the workspace pane's SnapGuide
const SnapGuide = ({ axis }: { axis: 'x' | 'y' }) => (
  <div
    aria-hidden="true"
    className={
      axis === 'x'
        ? 'pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--t-accent)]'
        : 'pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--t-accent)]'
    }
  />
)

// `area` is in % of the source image. w/ restrictPosition=false + minZoom<1 the
// values may go outside [0, 100] when the crop extends past the image edges
// (letterboxed). store as-is; isValidCoverFrame allows the out-of-image case
const cropAreaToFrame = (area: Area): CoverFrame => ({
  x: area.x / 100,
  y: area.y / 100,
  width: area.width / 100,
  height: area.height / 100,
})

const frameToCropArea = (frame: CoverFrame | null): Area | undefined =>
  frame
    ? {
        x: frame.x * 100,
        y: frame.y * 100,
        width: frame.width * 100,
        height: frame.height * 100,
      }
    : undefined

interface ZoomSliderProps
{
  zoom: number
  onChange: (z: number) => void
  disabled?: boolean
}

const ZoomSlider = ({ zoom, onChange, disabled }: ZoomSliderProps) => (
  <div className="flex shrink-0 items-center gap-3">
    <span className="text-[11px] uppercase tracking-wide text-[var(--t-text-faint)]">
      Zoom
    </span>
    <input
      type="range"
      aria-label="Zoom"
      min={ZOOM_MIN}
      max={ZOOM_MAX}
      step={ZOOM_STEP}
      value={zoom}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="focus-custom h-1 flex-1 cursor-pointer accent-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-50"
    />
    <span className="w-12 text-right tabular-nums text-[11px] text-[var(--t-text-muted)]">
      {zoom.toFixed(2)}×
    </span>
  </div>
)

interface SurfaceTilesProps
{
  source: SourceMeta
  framing: TemplateCoverFraming
  activeSurface: CoverSurface
  onSelect: (s: CoverSurface) => void
}

const SurfaceTiles = ({
  source,
  framing,
  activeSurface,
  onSelect,
}: SurfaceTilesProps) => (
  <div className="flex flex-wrap items-end justify-center gap-3">
    {SURFACE_PRESENTATION.map((surface) => (
      <SurfaceTile
        key={surface.id}
        id={surface.id}
        label={surface.label}
        width={surface.width}
        height={surface.height}
        source={source}
        frame={framing[surface.id]}
        isActive={activeSurface === surface.id}
        onSelect={onSelect}
      />
    ))}
  </div>
)

interface SurfaceTileProps
{
  id: CoverSurface
  label: string
  width: number
  height: number
  source: SourceMeta
  frame: CoverFrame | null
  isActive: boolean
  onSelect: (s: CoverSurface) => void
}

const SurfaceTile = ({
  id,
  label,
  width,
  height,
  source,
  frame,
  isActive,
  onSelect,
}: SurfaceTileProps) =>
{
  const placement = useMemo(() =>
  {
    const computed = computeFramedPlacement({
      frame,
      containerWidth: width,
      containerHeight: height,
      sourceWidth: source.width,
      sourceHeight: source.height,
    })
    if (!computed) return null
    return coverFramePlacementStyle(computed)
  }, [frame, width, height, source.width, source.height])

  const tileBaseClass =
    'focus-custom flex flex-col items-center gap-1.5 rounded-lg border p-1.5 transition focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]'
  const tileStateClass = isActive
    ? 'border-[var(--t-accent)] bg-[rgb(var(--t-overlay)/0.06)]'
    : 'border-[var(--t-border-secondary)] hover:border-[var(--t-border-hover)]'

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={isActive}
      aria-label={`Frame ${label}`}
      className={`${tileBaseClass} ${tileStateClass}`}
    >
      <div
        className="relative overflow-hidden rounded-md bg-[var(--t-media-matte)]"
        style={{ width, height }}
      >
        {placement && (
          <img src={source.url} alt="" draggable={false} style={placement} />
        )}
      </div>
      <span
        className={`text-[10px] uppercase tracking-wide ${
          isActive ? 'text-[var(--t-text)]' : 'text-[var(--t-text-faint)]'
        }`}
      >
        {label}
      </span>
    </button>
  )
}
