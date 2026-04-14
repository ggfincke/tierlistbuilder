// src/features/workspace/settings/ui/LayoutTab.tsx
// layout tab content for item sizing, label styling, & row controls

import { PanelTop, PanelBottom, PanelLeft, PanelRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'

import { announce } from '@/shared/a11y/announce'
import { useSettingsStore } from '@/features/workspace/settings/model/useSettingsStore'
import type {
  ItemShape,
  ItemSize,
  LabelWidth,
  TierLabelFontSize,
  ToolbarPosition,
} from '@/shared/types/settings'
import { SegmentedControl } from './SegmentedControl'
import { SettingRow } from './SettingRow'
import { SettingsSection } from './SettingsSection'
import { Toggle } from './Toggle'

export const LayoutTab = () =>
{
  const {
    itemSize,
    showLabels,
    itemShape,
    compactMode,
    labelWidth,
    hideRowControls,
    tierLabelBold,
    tierLabelItalic,
    tierLabelFontSize,
    showAltTextButton,
    toolbarPosition,
    setItemSize,
    setShowLabels,
    setItemShape,
    setCompactMode,
    setLabelWidth,
    setHideRowControls,
    setTierLabelBold,
    setTierLabelItalic,
    setTierLabelFontSize,
    setShowAltTextButton,
    setToolbarPosition,
  } = useSettingsStore(
    useShallow((state) => ({
      itemSize: state.itemSize,
      showLabels: state.showLabels,
      itemShape: state.itemShape,
      compactMode: state.compactMode,
      labelWidth: state.labelWidth,
      hideRowControls: state.hideRowControls,
      tierLabelBold: state.tierLabelBold,
      tierLabelItalic: state.tierLabelItalic,
      tierLabelFontSize: state.tierLabelFontSize,
      showAltTextButton: state.showAltTextButton,
      toolbarPosition: state.toolbarPosition,
      setItemSize: state.setItemSize,
      setShowLabels: state.setShowLabels,
      setItemShape: state.setItemShape,
      setCompactMode: state.setCompactMode,
      setLabelWidth: state.setLabelWidth,
      setHideRowControls: state.setHideRowControls,
      setTierLabelBold: state.setTierLabelBold,
      setTierLabelItalic: state.setTierLabelItalic,
      setTierLabelFontSize: state.setTierLabelFontSize,
      setShowAltTextButton: state.setShowAltTextButton,
      setToolbarPosition: state.setToolbarPosition,
    }))
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
