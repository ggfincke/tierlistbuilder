// src/components/settings/TierSettingsItemsTab.tsx
// items tab content for image import, text items, & deleted items

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
}: TierSettingsItemsTabProps) => (
  <>
    <SettingsSection title="Import Images">
      <p className="-mt-1 mb-2 text-xs text-[var(--t-text-faint)]">
        Drop files here or choose them from your computer.
      </p>
      <ImageUploader />
    </SettingsSection>

    <SettingsSection title="Add Text Item">
      <div className="flex items-center gap-2">
        <input
          type="text"
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
          className="min-w-0 flex-1 rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-2.5 py-1.5 text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] outline-none focus:border-[var(--t-border-hover)]"
        />
        <input
          type="color"
          value={textColor}
          onChange={(event) => onTextColorChange(event.target.value)}
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--t-border-secondary)] bg-transparent"
        />
        <button
          type="button"
          disabled={!textLabel.trim()}
          onClick={onAddTextItem}
          className="rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-1.5 text-sm font-medium text-[var(--t-text)] hover:border-[var(--t-border-hover)] hover:bg-[var(--t-bg-active)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Add
        </button>
      </div>
    </SettingsSection>

    <DeletedItemsSection />
  </>
)
