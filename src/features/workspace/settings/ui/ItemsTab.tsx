// src/features/workspace/settings/ui/ItemsTab.tsx
// items tab content for image import, URL import, text items, & deleted items

import { useCallback, useId, useState } from 'react'

import { useActiveBoardStore } from '~/features/workspace/boards/model/useActiveBoardStore'
import { fetchImageAsItemImage } from '~/features/workspace/settings/lib/imageFromUrl'
import { ColorInput } from '~/shared/ui/ColorInput'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'
import { DeletedItemsSection } from './DeletedItemsSection'
import { ImageUploader } from './ImageUploader'
import { SettingsSection } from './SettingsSection'

interface ItemsTabProps
{
  textLabel: string
  textColor: string
  onTextLabelChange: (value: string) => void
  onTextColorChange: (value: string) => void
  onAddTextItem: () => void
}

// validate that input looks like an image URL
const isValidImageUrl = (value: string): boolean =>
{
  try
  {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch
  {
    return false
  }
}

export const ItemsTab = ({
  textLabel,
  textColor,
  onTextLabelChange,
  onTextColorChange,
  onAddTextItem,
}: ItemsTabProps) =>
{
  const labelInputId = useId()
  const colorInputId = useId()
  const urlInputId = useId()

  const addItems = useActiveBoardStore((s) => s.addItems)

  const [imageUrl, setImageUrl] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const handleAddFromUrl = useCallback(async () =>
  {
    const trimmed = imageUrl.trim()
    if (!trimmed || !isValidImageUrl(trimmed))
    {
      setUrlError('Enter a valid image URL (https://...).')
      return
    }

    setUrlLoading(true)
    setUrlError(null)

    try
    {
      const result = await fetchImageAsItemImage(trimmed)
      addItems([result])
      setImageUrl('')
    }
    catch (err)
    {
      setUrlError(err instanceof Error ? err.message : 'Failed to load image.')
    }
    finally
    {
      setUrlLoading(false)
    }
  }, [addItems, imageUrl])

  return (
    <>
      <SettingsSection title="Import Images">
        <p className="-mt-1 mb-2 text-xs text-[var(--t-text-muted)]">
          Drop files here or choose them from your computer.
        </p>
        <ImageUploader />
      </SettingsSection>

      <SettingsSection title="Import from URL">
        <div className="flex items-center gap-2">
          <label htmlFor={urlInputId} className="sr-only">
            Image URL
          </label>
          <TextInput
            id={urlInputId}
            value={imageUrl}
            onChange={(e) =>
            {
              setImageUrl(e.target.value)
              setUrlError(null)
            }}
            onKeyDown={(e) =>
            {
              if (e.key === 'Enter') void handleAddFromUrl()
            }}
            placeholder="https://example.com/image.png"
            className="min-w-0 flex-1"
            disabled={urlLoading}
          />
          <SecondaryButton
            disabled={!imageUrl.trim() || urlLoading}
            onClick={() => void handleAddFromUrl()}
            variant="surface"
            className="font-medium"
          >
            {urlLoading ? 'Loading…' : 'Add'}
          </SecondaryButton>
        </div>
        {urlError && (
          <p className="mt-1.5 text-xs text-[color-mix(in_srgb,var(--t-destructive)_30%,var(--t-text))]">
            {urlError}
          </p>
        )}
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
          <ColorInput
            id={colorInputId}
            size="md"
            value={textColor}
            onChange={(event) => onTextColorChange(event.target.value)}
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
