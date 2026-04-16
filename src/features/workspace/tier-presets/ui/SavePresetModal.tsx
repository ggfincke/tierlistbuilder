// src/features/workspace/tier-presets/ui/SavePresetModal.tsx
// modal prompt for naming & saving the current board as a reusable preset

import { useId, useRef, useState } from 'react'

import { BaseModal } from '~/shared/overlay/BaseModal'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface SavePresetModalProps
{
  // starting value shown when the modal opens
  defaultName: string
  // called when the modal closes
  onClose: () => void
  // called after the user confirms a valid preset name
  onSave: (name: string) => void
}

export const SavePresetModal = ({
  defaultName,
  onClose,
  onSave,
}: SavePresetModalProps) =>
{
  const [presetName, setPresetName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const inputId = useId()

  const handleSave = () =>
  {
    const trimmedName = presetName.trim()

    if (!trimmedName)
    {
      return
    }

    onSave(trimmedName)
    onClose()
  }

  return (
    <BaseModal
      open={true}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descriptionId}
      initialFocusRef={inputRef}
      panelClassName="w-full max-w-sm p-4"
    >
      <h2 id={titleId} className="text-lg font-semibold text-[var(--t-text)]">
        Save as Preset
      </h2>
      <p id={descriptionId} className="mt-1 text-sm text-[var(--t-text-muted)]">
        Saves the current tier structure (names & colors) for reuse.
      </p>
      <label htmlFor={inputId} className="sr-only">
        Preset name
      </label>
      <TextInput
        id={inputId}
        ref={inputRef}
        value={presetName}
        onChange={(event) => setPresetName(event.target.value)}
        onKeyDown={(event) =>
        {
          if (event.key === 'Enter')
          {
            event.preventDefault()
            handleSave()
          }
        }}
        placeholder="Preset name"
        size="md"
        className="mt-3 w-full rounded-lg border-[var(--t-border)] focus:border-[var(--t-accent-hover)]"
      />
      <div className="mt-3 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={!presetName.trim()} onClick={handleSave}>
          Save
        </PrimaryButton>
      </div>
    </BaseModal>
  )
}
