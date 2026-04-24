// src/features/workspace/tier-presets/ui/SavePresetModal.tsx
// modal prompt for naming & saving the current board as a reusable preset

import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useId, useRef, useState } from 'react'

import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface SavePresetModalProps
{
  defaultName: string
  onClose: () => void
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
      <ModalHeader titleId={titleId}>Save as Preset</ModalHeader>
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
