// src/components/ui/ShortcutsPanel.tsx
// floating overlay listing all keyboard shortcuts

import { useId, useRef } from 'react'

import { BaseModal } from './BaseModal'
import { SecondaryButton } from './SecondaryButton'
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
      <h2
        id={titleId}
        className="mb-4 text-lg font-semibold text-[var(--t-text)]"
      >
        Keyboard Shortcuts
      </h2>

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
