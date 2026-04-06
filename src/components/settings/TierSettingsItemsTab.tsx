// src/components/settings/TierSettingsItemsTab.tsx
// items tab content for image import, text items, & deleted items

import { useId } from 'react'

import { SecondaryButton } from '../ui/SecondaryButton'
import { TextInput } from '../ui/TextInput'
import { DeletedItemsSection } from './DeletedItemsSection'
import { ImageUploader } from './ImageUploader'
import { SettingsSection } from './SettingsSection'

interface TierSettingsItemsTabProps
{
  textLabel: string
  textColor: string
  onTextLabelChange: (value: string) => void
  onTextColorChange: (value: string) => void
  onAddTextItem: () => void
}

export const TierSettingsItemsTab = ({
  textLabel,
  textColor,
  onTextLabelChange,
  onTextColorChange,
  onAddTextItem,
}: TierSettingsItemsTabProps) =>
{
  const labelInputId = useId()
  const colorInputId = useId()

  return (
    <>
      <SettingsSection title="Import Images">
        <p className="-mt-1 mb-2 text-xs text-[var(--t-text-muted)]">
          Drop files here or choose them from your computer.
        </p>
        <ImageUploader />
      </SettingsSection>

      <SettingsSection title="Add Text Item">
        <div className="flex items-center gap-2">
          <label htmlFor={labelInputId} className="sr-only">
            Text item label
          </label>
          <TextInput
            id={labelInputId}
            value={textLabel}
            onChange={(event) => onTextLabelChange(event.target.value)}
            onKeyDown={(event) =>
            {
              if (event.key === 'Enter')
              {
                onAddTextItem()
              }
            }}
            placeholder="Label"
            className="min-w-0 flex-1"
          />
          <label htmlFor={colorInputId} className="sr-only">
            Text item background color
          </label>
          <input
            id={colorInputId}
            type="color"
            value={textColor}
            onChange={(event) => onTextColorChange(event.target.value)}
            className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
          />
          <SecondaryButton
            disabled={!textLabel.trim()}
            onClick={onAddTextItem}
            variant="surface"
            className="font-medium"
          >
            Add
          </SecondaryButton>
        </div>
      </SettingsSection>

      <DeletedItemsSection />
    </>
  )
}
