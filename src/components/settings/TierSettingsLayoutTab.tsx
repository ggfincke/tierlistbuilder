// src/components/settings/TierSettingsLayoutTab.tsx
// layout tab content for item sizing, label styling, & row controls

import { useSettingsStore } from '../../store/useSettingsStore'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
} from '../../types'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { Toggle } from './Toggle'

export const TierSettingsLayoutTab = () =>
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

  return (
    <>
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
