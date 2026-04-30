// src/features/workspace/imageEditor/ui/BoardControlsBar.tsx
// board-wide ratio, label, trim-shadow, & bulk auto-crop controls

import type { RatioOption } from '~/shared/board-ui/aspectRatio'
import type { useBoardAspectRatioPicker } from '~/features/workspace/settings/model/useBoardAspectRatioPicker'
import {
  AspectRatioChips,
  CustomRatioInput,
} from '~/features/workspace/settings/ui/AspectRatioPicker'
import { AutoCropTrimToggle } from '~/features/workspace/settings/ui/AutoCropTrimToggle'
import { ShowLabelsToggle } from '~/features/workspace/settings/ui/ShowLabelsToggle'
import { AutoCropButton } from './AutoCropButton'

interface BoardControlsBarProps
{
  ratioPicker: ReturnType<typeof useBoardAspectRatioPicker>
  onRatioOption: (option: RatioOption) => void
  onApplyCustomRatio: () => void
  onAutoCropAll: () => void
  autoCropProgress: { running: boolean; done: number; total: number }
  autoCropAllApplied: boolean
  trimSoftShadows: boolean
  onTrimSoftShadowsChange: (trim: boolean) => void
  showLabels: boolean
  onShowLabelsChange: (show: boolean) => void
}

export const BoardControlsBar = ({
  ratioPicker,
  onRatioOption,
  onApplyCustomRatio,
  onAutoCropAll,
  autoCropProgress,
  autoCropAllApplied,
  trimSoftShadows,
  onTrimSoftShadowsChange,
  showLabels,
  onShowLabelsChange,
}: BoardControlsBarProps) => (
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--t-border-secondary)] bg-[var(--t-bg-page)] px-5 py-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--t-text-muted)]">
        Board ratio
      </span>
      <AspectRatioChips
        selectedOption={ratioPicker.selectedOption}
        onSelect={onRatioOption}
        autoRatio={ratioPicker.autoRatio}
        customRatioValue={ratioPicker.boardAspectRatio}
      />
      {ratioPicker.customOpen && (
        <CustomRatioInput
          width={ratioPicker.customWidth}
          height={ratioPicker.customHeight}
          onWidthChange={ratioPicker.setCustomWidth}
          onHeightChange={ratioPicker.setCustomHeight}
          onApply={onApplyCustomRatio}
          canApply={ratioPicker.canApplyCustom}
        />
      )}
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ShowLabelsToggle checked={showLabels} onChange={onShowLabelsChange} />
      <AutoCropTrimToggle
        checked={trimSoftShadows}
        onChange={onTrimSoftShadowsChange}
        disabled={autoCropProgress.running}
      />
      <AutoCropButton
        onClick={onAutoCropAll}
        disabled={autoCropProgress.running || autoCropAllApplied}
        minWidthClassName="min-w-[8.75rem]"
        state={
          autoCropProgress.running
            ? 'running'
            : autoCropAllApplied
              ? 'applied'
              : 'idle'
        }
        variant="toolbar"
        labels={{
          running: `Auto-cropping... ${autoCropProgress.done}/${autoCropProgress.total}`,
          applied: 'Auto-cropped all',
          idle: 'Auto-crop all',
        }}
        ariaLabels={{
          running: `Auto-cropping in progress, ${autoCropProgress.done} of ${autoCropProgress.total} done`,
          applied: 'Auto-crop applied to all images',
          idle: 'Auto-crop all images to detected content',
        }}
        title={autoCropAllApplied ? 'Auto-crop is applied' : undefined}
      />
    </div>
  </div>
)
