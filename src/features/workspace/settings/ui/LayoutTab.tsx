// src/features/workspace/settings/ui/LayoutTab.tsx
// layout tab content for item sizing, label styling, & row controls

import { PanelTop, PanelBottom, PanelLeft, PanelRight } from 'lucide-react'

import { announce } from '~/shared/a11y/announce'
import { useSettingsStore } from '~/features/workspace/settings/model/useSettingsStore'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@tierlistbuilder/contracts/workspace/settings'
import { SettingsSection } from '~/shared/ui/SettingsSection'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { Toggle } from './Toggle'

export const LayoutTab = () =>
{
  const itemSize = useSettingsStore((state) => state.itemSize)
  const showLabels = useSettingsStore((state) => state.showLabels)
  const itemShape = useSettingsStore((state) => state.itemShape)
  const compactMode = useSettingsStore((state) => state.compactMode)
  const labelWidth = useSettingsStore((state) => state.labelWidth)
  const hideRowControls = useSettingsStore((state) => state.hideRowControls)
  const tierLabelBold = useSettingsStore((state) => state.tierLabelBold)
  const tierLabelItalic = useSettingsStore((state) => state.tierLabelItalic)
  const tierLabelFontSize = useSettingsStore((state) => state.tierLabelFontSize)
  const showAltTextButton = useSettingsStore((state) => state.showAltTextButton)
  const toolbarPosition = useSettingsStore((state) => state.toolbarPosition)
  const setItemSize = useSettingsStore((state) => state.setItemSize)
  const setShowLabels = useSettingsStore((state) => state.setShowLabels)
  const setItemShape = useSettingsStore((state) => state.setItemShape)
  const setCompactMode = useSettingsStore((state) => state.setCompactMode)
  const setLabelWidth = useSettingsStore((state) => state.setLabelWidth)
  const setHideRowControls = useSettingsStore(
    (state) => state.setHideRowControls
  )
  const setTierLabelBold = useSettingsStore((state) => state.setTierLabelBold)
  const setTierLabelItalic = useSettingsStore(
    (state) => state.setTierLabelItalic
  )
  const setTierLabelFontSize = useSettingsStore(
    (state) => state.setTierLabelFontSize
  )
  const setShowAltTextButton = useSettingsStore(
    (state) => state.setShowAltTextButton
  )
  const setToolbarPosition = useSettingsStore(
    (state) => state.setToolbarPosition
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
        <SettingRow label="Show Labels">
          <Toggle checked={showLabels} onChange={setShowLabels} />
        </SettingRow>
        <SettingRow label="Compact Mode">
          <Toggle checked={compactMode} onChange={setCompactMode} />
        </SettingRow>
        <SettingRow label="Alt Text Button">
          <Toggle checked={showAltTextButton} onChange={setShowAltTextButton} />
        </SettingRow>
      </SettingsSection>

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
