// src/features/workspace/settings/ui/LayoutTab.tsx
// layout tab content for item sizing, label styling, & row controls

import {
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RotateCcw,
} from 'lucide-react'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { announce } from '~/shared/a11y/announce'
import { usePreferencesStore } from '~/features/platform/preferences/model/usePreferencesStore'
import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { selectLabelOverrideStatus } from '~/features/workspace/boards/model/slices/selectors'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@tierlistbuilder/contracts/platform/preferences'
import {
  LABEL_FONT_SIZE_PX_MAX,
  LABEL_FONT_SIZE_PX_MIN,
  type LabelPlacementMode,
} from '@tierlistbuilder/contracts/workspace/board'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { AspectRatioSection } from './AspectRatioSection'
import { NumberStepper } from '~/shared/ui/NumberStepper'
import { SegmentedControl } from '~/shared/ui/settings/SegmentedControl'
import { SettingRow } from '~/shared/ui/settings/SettingRow'
import { Toggle } from '~/shared/ui/settings/Toggle'

const LABEL_PLACEMENT_MODE_LABEL: Record<LabelPlacementMode, string> = {
  overlay: 'Overlay',
  captionAbove: 'Above',
  captionBelow: 'Below',
}

const CAPTION_PLACEMENT_OPTIONS = (
  Object.keys(LABEL_PLACEMENT_MODE_LABEL) as LabelPlacementMode[]
).map((value) => ({ value, label: LABEL_PLACEMENT_MODE_LABEL[value] }))

const formatOverrideStatus = (
  boardOverridden: boolean,
  itemCount: number
): string =>
{
  const itemPart =
    itemCount === 0 ? '' : `${itemCount} item${itemCount === 1 ? '' : 's'}`
  if (boardOverridden && itemPart) return `Board + ${itemPart}`
  if (boardOverridden) return 'Board'
  return itemPart
}

export const LayoutTab = () =>
{
  const {
    itemSize,
    showLabels,
    defaultLabelPlacementMode,
    defaultLabelFontSizePx,
    itemShape,
    compactMode,
    labelWidth,
    hideRowControls,
    tierLabelBold,
    tierLabelItalic,
    tierLabelFontSize,
    showItemEditButton,
    autoCropTrimSoftShadows,
    toolbarPosition,
    setItemSize,
    setShowLabels,
    setDefaultLabelPlacementMode,
    setDefaultLabelFontSizePx,
    setItemShape,
    setCompactMode,
    setLabelWidth,
    setHideRowControls,
    setTierLabelBold,
    setTierLabelItalic,
    setTierLabelFontSize,
    setShowItemEditButton,
    setAutoCropTrimSoftShadows,
    setToolbarPosition,
  } = usePreferencesStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      showLabels: state.showLabels,
      defaultLabelPlacementMode: state.defaultLabelPlacementMode,
      defaultLabelFontSizePx: state.defaultLabelFontSizePx,
      itemShape: state.itemShape,
      compactMode: state.compactMode,
      labelWidth: state.labelWidth,
      hideRowControls: state.hideRowControls,
      tierLabelBold: state.tierLabelBold,
      tierLabelItalic: state.tierLabelItalic,
      tierLabelFontSize: state.tierLabelFontSize,
      showItemEditButton: state.showItemEditButton,
      autoCropTrimSoftShadows: state.autoCropTrimSoftShadows,
      toolbarPosition: state.toolbarPosition,
      setItemSize: state.setItemSize,
      setShowLabels: state.setShowLabels,
      setDefaultLabelPlacementMode: state.setDefaultLabelPlacementMode,
      setDefaultLabelFontSizePx: state.setDefaultLabelFontSizePx,
      setItemShape: state.setItemShape,
      setCompactMode: state.setCompactMode,
      setLabelWidth: state.setLabelWidth,
      setHideRowControls: state.setHideRowControls,
      setTierLabelBold: state.setTierLabelBold,
      setTierLabelItalic: state.setTierLabelItalic,
      setTierLabelFontSize: state.setTierLabelFontSize,
      setShowItemEditButton: state.setShowItemEditButton,
      setAutoCropTrimSoftShadows: state.setAutoCropTrimSoftShadows,
      setToolbarPosition: state.setToolbarPosition,
    }))
  )

  // selector returns a stable reference when the override set is unchanged,
  // so unrelated board mutations (drags, transforms, etc.) don't re-render
  const overrideStatus = useActiveBoardStore(selectLabelOverrideStatus)
  const { setBoardAndItemsLabelOptions, setBoardLabelSettings, boardLabels } =
    useActiveBoardStore(
      useShallow((state) => ({
        setBoardAndItemsLabelOptions: state.setBoardAndItemsLabelOptions,
        setBoardLabelSettings: state.setBoardLabelSettings,
        boardLabels: state.labels,
      }))
    )

  const canEditCaptionPlacement =
    showLabels || overrideStatus.hasVisibleOverride
  const overrideStatusText = formatOverrideStatus(
    overrideStatus.boardOverridden,
    overrideStatus.itemOverrideCount
  )

  const handleResetLabelOverrides = useCallback(() =>
  {
    setBoardAndItemsLabelOptions(
      null,
      overrideStatus.itemOverrideIds.map((id) => ({ id, options: null }))
    )
    announce('Label overrides cleared')
  }, [overrideStatus.itemOverrideIds, setBoardAndItemsLabelOptions])

  // also re-pin the active board's override so captions update right away —
  // template imports bake fontSizePx into boardLabels & would shadow the global
  const handleCaptionFontSizeChange = useCallback(
    (px: number) =>
    {
      setDefaultLabelFontSizePx(px)
      if (
        boardLabels?.fontSizePx !== undefined &&
        boardLabels.fontSizePx !== px
      )
      {
        setBoardLabelSettings({ ...boardLabels, fontSizePx: px })
      }
      announce(`Caption size set to ${px} pixels`)
    },
    [boardLabels, setBoardLabelSettings, setDefaultLabelFontSizePx]
  )

  return (
    <>
      <SettingsSection title="Toolbar">
        <SettingRow label="Position">
          <SegmentedControl<ToolbarPosition>
            options={[
              {
                value: 'top',
                label: <PanelTop className="h-4 w-4" strokeWidth={1.8} />,
                ariaLabel: 'Top',
              },
              {
                value: 'bottom',
                label: <PanelBottom className="h-4 w-4" strokeWidth={1.8} />,
                ariaLabel: 'Bottom',
              },
              {
                value: 'left',
                label: <PanelLeft className="h-4 w-4" strokeWidth={1.8} />,
                ariaLabel: 'Left',
              },
              {
                value: 'right',
                label: <PanelRight className="h-4 w-4" strokeWidth={1.8} />,
                ariaLabel: 'Right',
              },
            ]}
            value={toolbarPosition}
            onChange={(pos) =>
            {
              setToolbarPosition(pos)
              announce(`Toolbar moved to ${pos}`)
            }}
          />
        </SettingRow>
      </SettingsSection>

      <SettingsSection title="Items">
        <SettingRow label="Item Size">
          <SegmentedControl<ItemSize>
            options={[
              { value: 'small', label: 'S' },
              { value: 'medium', label: 'M' },
              { value: 'large', label: 'L' },
            ]}
            value={itemSize}
            onChange={setItemSize}
          />
        </SettingRow>
        <SettingRow label="Item Shape">
          <SegmentedControl<ItemShape>
            options={[
              { value: 'square', label: 'Square' },
              { value: 'rounded', label: 'Rounded' },
              { value: 'circle', label: 'Circle' },
            ]}
            value={itemShape}
            onChange={setItemShape}
          />
        </SettingRow>
        <SettingRow label="Compact Mode">
          <Toggle checked={compactMode} onChange={setCompactMode} />
        </SettingRow>
        <SettingRow label="Edit Button">
          <Toggle
            checked={showItemEditButton}
            onChange={setShowItemEditButton}
          />
        </SettingRow>
        <SettingRow label="Trim Shadows">
          <Toggle
            checked={autoCropTrimSoftShadows}
            onChange={setAutoCropTrimSoftShadows}
          />
        </SettingRow>
        <SettingRow label="Show Labels">
          <Toggle checked={showLabels} onChange={setShowLabels} />
        </SettingRow>
        {canEditCaptionPlacement && (
          <>
            <SettingRow label="Caption Placement">
              <SegmentedControl<LabelPlacementMode>
                options={CAPTION_PLACEMENT_OPTIONS}
                value={defaultLabelPlacementMode}
                onChange={(mode) =>
                {
                  setDefaultLabelPlacementMode(mode)
                  announce(
                    `Caption placement set to ${LABEL_PLACEMENT_MODE_LABEL[mode].toLowerCase()}`
                  )
                }}
              />
            </SettingRow>
            <SettingRow label="Caption Size">
              <NumberStepper
                value={boardLabels?.fontSizePx ?? defaultLabelFontSizePx}
                min={LABEL_FONT_SIZE_PX_MIN}
                max={LABEL_FONT_SIZE_PX_MAX}
                step={1}
                suffix="px"
                inputLabel="Caption font size in pixels"
                decreaseLabel="Decrease caption font size"
                increaseLabel="Increase caption font size"
                decreaseTitle="Smaller"
                increaseTitle="Larger"
                active={boardLabels?.fontSizePx !== undefined}
                onChange={handleCaptionFontSizeChange}
              />
            </SettingRow>
          </>
        )}
        {overrideStatus.hasAny && (
          <>
            <SettingRow label="Label Overrides">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--t-text-muted)]">
                  {overrideStatusText}
                </span>
                <button
                  type="button"
                  onClick={handleResetLabelOverrides}
                  aria-label="Reset label overrides to use Show Labels and Caption Placement defaults"
                  title="Reset to defaults"
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--t-text-secondary)] hover:bg-[var(--t-bg-hover)] hover:text-[var(--t-text)]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>
            </SettingRow>
            <p className="-mt-1 mb-1 text-xs text-[var(--t-text-faint)]">
              This board overrides the defaults above. Reset to use them.
            </p>
          </>
        )}
      </SettingsSection>

      <AspectRatioSection />

      <SettingsSection title="Tier Labels">
        <SettingRow label="Label Width">
          <SegmentedControl<LabelWidth>
            options={[
              { value: 'narrow', label: 'Narrow' },
              { value: 'default', label: 'Default' },
              { value: 'wide', label: 'Wide' },
            ]}
            value={labelWidth}
            onChange={setLabelWidth}
          />
        </SettingRow>
        <SettingRow label="Font Size">
          <SegmentedControl<TierLabelFontSize>
            options={[
              { value: 'xs', label: 'XS' },
              { value: 'small', label: 'S' },
              { value: 'medium', label: 'M' },
              { value: 'large', label: 'L' },
              { value: 'xl', label: 'XL' },
            ]}
            value={tierLabelFontSize}
            onChange={setTierLabelFontSize}
          />
        </SettingRow>
        <SettingRow label="Bold">
          <Toggle checked={tierLabelBold} onChange={setTierLabelBold} />
        </SettingRow>
        <SettingRow label="Italic">
          <Toggle checked={tierLabelItalic} onChange={setTierLabelItalic} />
        </SettingRow>
        <SettingRow label="Hide Row Controls">
          <Toggle checked={hideRowControls} onChange={setHideRowControls} />
        </SettingRow>
      </SettingsSection>
    </>
  )
}
