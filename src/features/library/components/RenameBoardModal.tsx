// src/features/library/components/RenameBoardModal.tsx
// small prompt-style modal for renaming a library board

import { useId, useRef, useState, type FormEvent } from 'react'

import { BaseModal } from '~/shared/overlay/BaseModal'
import { DialogActions } from '~/shared/overlay/DialogActions'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface RenameBoardModalProps
{
  open: boolean
  currentTitle: string
  onCancel: () => void
  onSubmit: (nextTitle: string) => void
}

export const RenameBoardModal = ({
  open,
  currentTitle,
  onCancel,
  onSubmit,
}: RenameBoardModalProps) =>
{
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  // parent remounts via key when the target changes, so init-from-prop is safe
  const [value, setValue] = useState(currentTitle)

  const trimmed = value.trim()
  const isEmpty = trimmed.length === 0
  const isUnchanged = trimmed === currentTitle.trim()
  const isInvalid = isEmpty || isUnchanged

  const handleSubmit = (event: FormEvent<HTMLFormElement>) =>
  {
    event.preventDefault()
    if (isInvalid) return
    onSubmit(value)
  }

  return (
    <BaseModal
      open={open}
      onClose={onCancel}
      labelledBy={titleId}
      initialFocusRef={inputRef}
      panelClassName="w-full max-w-sm p-4"
    >
      <ModalHeader titleId={titleId}>Rename board</ModalHeader>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
        <TextInput
          ref={inputRef}
          aria-label="Board title"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.target.select()}
          maxLength={120}
        />
        <DialogActions className="flex justify-end gap-2">
          <SecondaryButton type="button" onClick={onCancel}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isInvalid}>
            Save
          </PrimaryButton>
        </DialogActions>
      </form>
    </BaseModal>
  )
}
