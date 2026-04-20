// src/features/workspace/shortcuts/ui/ShortcutsPanel.tsx
// floating overlay listing all keyboard shortcuts

import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useId, useRef } from 'react'

import { BaseModal } from '~/shared/overlay/BaseModal'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { ShortcutsList } from './ShortcutsList'

interface ShortcutsPanelProps
{
  onClose: () => void
}

export const ShortcutsPanel = ({ onClose }: ShortcutsPanelProps) =>
{
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  return (
    <BaseModal
      open={true}
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={closeButtonRef}
      panelClassName="w-full max-w-md p-5"
    >
      <ModalHeader
        titleId={titleId}
        className="mb-4 text-lg font-semibold text-[var(--t-text)]"
      >
        Keyboard Shortcuts
      </ModalHeader>

      <ShortcutsList />

      <div className="mt-5 flex justify-end">
        <SecondaryButton
          ref={closeButtonRef}
          variant="surface"
          onClick={onClose}
        >
          Close
        </SecondaryButton>
      </div>
    </BaseModal>
  )
}
