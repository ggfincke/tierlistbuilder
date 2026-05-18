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
import type { AutoCropStatus } from '~/features/workspace/imageEditor/model/auto-crop/useImageEditorAutoCropItem'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { AutoCropButton } from '~/features/workspace/imageEditor/ui/AutoCropButton'
import { ZoomSlider } from '~/features/workspace/imageEditor/ui/ZoomSlider'

interface PaneFooterTransformProps
{
  rotate: (delta: 90 | -90) => void
  displayZoom: number
  displayZoomMin: number
  displaySliderZoomMax: number
  onZoomLiveChange: (zoom: number) => void
  centerOffsets: () => void
  working: ItemTransform
  autoCrop: () => void
  autoCropStatus: AutoCropStatus
  reset: () => void
  hasChanges: boolean
  isDirty: boolean
}

interface PaneFooterNavProps
{
  canPrev: boolean
  canNext: boolean
  canSkip: boolean
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
}

interface PaneFooterExpansionProps
{
  imageSectionId: string
  imageExpanded: boolean
  onImageExpandedChange: (expanded: boolean) => void
}

interface ImageEditorPaneFooterProps
{
  expansion: PaneFooterExpansionProps
  transform: PaneFooterTransformProps
  navigation: PaneFooterNavProps
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
  expansion,
  transform,
  navigation,
}: ImageEditorPaneFooterProps) => (
  <div
    className="sticky bottom-0 flex flex-col gap-2 border-t border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-3"
    role="group"
    aria-label="Image controls and navigation"
  >
    <button
      type="button"
      onClick={() => expansion.onImageExpandedChange(!expansion.imageExpanded)}
      aria-expanded={expansion.imageExpanded}
      aria-controls={expansion.imageSectionId}
      className="focus-custom inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[0.65rem] font-semibold tracking-wider text-[var(--t-text-faint)] uppercase hover:text-[var(--t-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      title={
        expansion.imageExpanded
          ? 'Collapse image controls'
          : 'Expand image controls'
      }
    >
      <ChevronRight
        className={`h-3 w-3 transition-transform ${expansion.imageExpanded ? 'rotate-90' : ''}`}
      />
      Image
    </button>
    {expansion.imageExpanded && (
      <div
        id={expansion.imageSectionId}
        className="flex flex-wrap items-center gap-3"
      >
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Rotate"
        >
          {ROTATE_CONTROLS.map(({ delta, label, title, icon: Icon }) => (
            <button
              key={delta}
              type="button"
              onClick={() => transform.rotate(delta)}
              className="focus-custom rounded p-1.5 text-[var(--t-text-muted)] hover:bg-[var(--t-bg-surface)] hover:text-[var(--t-text)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
              aria-label={label}
              title={title}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <ZoomSlider
          value={transform.displayZoom}
          min={transform.displayZoomMin}
          sliderMax={transform.displaySliderZoomMax}
          onLiveChange={transform.onZoomLiveChange}
        />
        <button
          type="button"
          onClick={transform.centerOffsets}
          disabled={
            transform.working.offsetX === 0 && transform.working.offsetY === 0
          }
          className="focus-custom inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--t-text-muted)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
          aria-label="Center image"
          title="Center the image - clears the pan offset"
        >
          <Crosshair className="h-3 w-3" />
          Center
        </button>
        <AutoCropButton
          onClick={transform.autoCrop}
          disabled={
            transform.autoCropStatus !== 'pending' &&
            transform.autoCropStatus !== 'ready'
          }
          minWidthClassName="min-w-[7.5rem]"
          state={
            transform.autoCropStatus === 'cropping'
              ? 'running'
              : transform.autoCropStatus === 'applied'
                ? 'applied'
                : 'idle'
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
            transform.autoCropStatus === 'applied'
              ? 'Already auto-cropped - adjust or reset to re-run'
              : transform.autoCropStatus === 'noContent'
                ? 'No crop detected'
                : 'Frame the detected content'
          }
        />
        <button
          type="button"
          onClick={transform.reset}
          disabled={!transform.hasChanges && !transform.isDirty}
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
          onClick={navigation.onPrev}
          disabled={!navigation.canPrev}
          variant="surface"
          size="sm"
          title="Previous item"
        >
          Prev
        </SecondaryButton>
        <SecondaryButton
          onClick={navigation.onSkip}
          disabled={!navigation.canSkip}
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
          onClick={navigation.onNext}
          disabled={!navigation.canNext}
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
