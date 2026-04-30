// src/features/workspace/imageEditor/ui/ImageEditorPaneFooter.tsx
// image transform controls & pane navigation footer

import {
  ChevronRight,
  Crosshair,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipForward,
} from 'lucide-react'

import type { ItemTransform } from '@tierlistbuilder/contracts/workspace/board'
import type { AutoCropBBox } from '@tierlistbuilder/contracts/workspace/imageMath'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { AutoCropButton } from './AutoCropButton'
import { ZoomSlider } from './ZoomSlider'

interface ImageEditorPaneFooterProps
{
  imageSectionId: string
  imageExpanded: boolean
  onImageExpandedChange: (expanded: boolean) => void
  rotate: (delta: 90 | -90) => void
  displayZoom: number
  displayZoomMin: number
  displaySliderZoomMax: number
  onZoomLiveChange: (zoom: number) => void
  centerOffsets: () => void
  working: ItemTransform
  autoCrop: () => void
  autoCropHash: string | undefined
  autoCropping: boolean
  autoCropResult: AutoCropBBox | null | undefined
  autoCropApplied: boolean
  reset: () => void
  hasChanges: boolean
  isDirty: boolean
  canPrev: boolean
  canNext: boolean
  canSkip: boolean
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
}

const ROTATE_CONTROLS: readonly {
  delta: 90 | -90
  label: string
  title: string
  icon: typeof RotateCcw
}[] = [
  {
    delta: -90,
    label: 'Rotate left 90 degrees',
    title: 'Rotate 90 degrees counter-clockwise',
    icon: RotateCcw,
  },
  {
    delta: 90,
    label: 'Rotate right 90 degrees',
    title: 'Rotate 90 degrees clockwise',
    icon: RotateCw,
  },
]

export const ImageEditorPaneFooter = ({
  imageSectionId,
  imageExpanded,
  onImageExpandedChange,
  rotate,
  displayZoom,
  displayZoomMin,
  displaySliderZoomMax,
  onZoomLiveChange,
  centerOffsets,
  working,
  autoCrop,
  autoCropHash,
  autoCropping,
  autoCropResult,
  autoCropApplied,
  reset,
  hasChanges,
  isDirty,
  canPrev,
  canNext,
  canSkip,
  onPrev,
  onNext,
  onSkip,
}: ImageEditorPaneFooterProps) => (
  <div
    className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-3"
    role="group"
    aria-label="Image controls and navigation"
  >
    <button
      type="button"
      onClick={() => onImageExpandedChange(!imageExpanded)}
      aria-expanded={imageExpanded}
      aria-controls={imageSectionId}
      className="focus-custom inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      title={
        imageExpanded ? 'Collapse image controls' : 'Expand image controls'
      }
    >
      <ChevronRight
        className={`h-3 w-3 transition-transform ${imageExpanded ? 'rotate-90' : ''}`}
      />
      Image
    </button>
    {imageExpanded && (
      <div id={imageSectionId} className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Rotate"
        >
          {ROTATE_CONTROLS.map(({ delta, label, title, icon: Icon }) => (
            <button
              key={delta}
              type="button"
              onClick={() => rotate(delta)}
              className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              aria-label={label}
              title={title}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <ZoomSlider
          value={displayZoom}
          min={displayZoomMin}
          sliderMax={displaySliderZoomMax}
          onLiveChange={onZoomLiveChange}
        />
        <button
          type="button"
          onClick={centerOffsets}
          disabled={working.offsetX === 0 && working.offsetY === 0}
          className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          aria-label="Center image"
          title="Center the image - clears the pan offset"
        >
          <Crosshair className="h-3 w-3" />
          Center
        </button>
        <AutoCropButton
          onClick={autoCrop}
          disabled={
            !autoCropHash ||
            autoCropping ||
            autoCropResult === null ||
            autoCropApplied
          }
          minWidthClassName="min-w-[7.5rem]"
          state={
            autoCropping ? 'running' : autoCropApplied ? 'applied' : 'idle'
          }
          variant="plain"
          labels={{
            running: 'Auto-crop',
            applied: 'Auto-cropped',
            idle: 'Auto-crop',
          }}
          ariaLabels={{
            running: 'Auto-cropping in progress',
            applied: 'Auto-crop applied to this image',
            idle: 'Auto-crop this image to detected content',
          }}
          title={
            autoCropApplied
              ? 'Already auto-cropped - adjust or reset to re-run'
              : autoCropResult === null
                ? 'No crop detected'
                : 'Frame the detected content'
          }
        />
        <button
          type="button"
          onClick={reset}
          disabled={!hasChanges && !isDirty}
          className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          title="Reset rotation, zoom, and pan to the default fit"
          aria-label="Reset image transforms (rotation, zoom, pan)"
        >
          <RefreshCw className="h-3 w-3" />
          Reset image
        </button>
      </div>
    )}
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Navigation"
    >
      <span
        className="text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase"
        aria-hidden="true"
      >
        Navigate
      </span>
      <div className="ml-auto flex items-center gap-2">
        <SecondaryButton
          onClick={onPrev}
          disabled={!canPrev}
          variant="surface"
          size="sm"
          title="Previous item"
        >
          Prev
        </SecondaryButton>
        <SecondaryButton
          onClick={onSkip}
          disabled={!canSkip}
          variant="outline"
          size="sm"
          title="Leave this item as-is and move on"
        >
          <span className="inline-flex items-center gap-1">
            <SkipForward className="h-3 w-3" />
            Skip
          </span>
        </SecondaryButton>
        <SecondaryButton
          onClick={onNext}
          disabled={!canNext}
          variant="surface"
          size="sm"
          title="Next item"
        >
          Next
        </SecondaryButton>
      </div>
    </div>
  </div>
)
