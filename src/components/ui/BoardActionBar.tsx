// src/components/ui/BoardActionBar.tsx
// floating action bar — add tier, settings, export, & reset controls
import { forwardRef, useCallback, useRef, useState, type ReactNode } from 'react'

import { Plus, RotateCcw, Settings as SettingsIcon, SquareArrowUp } from 'lucide-react'

import { usePopupClose } from '../../hooks/usePopupClose'
import { ConfirmDialog } from './ConfirmDialog'

interface BoardActionBarProps {
  // active export type while an export is in progress (null when idle)
  exportStatus: 'png' | 'pdf' | null
  onAddTier: () => void
  onOpenSettings: () => void
  onExport: (format: 'png' | 'pdf') => Promise<void>
  onReset: () => void
}

// props for the shared icon button used throughout the action bar
interface ActionButtonProps {
  // accessible label for screen readers
  label: string
  // tooltip text shown on hover
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  // set to "menu" when the button toggles a popup menu
  hasPopup?: 'menu'
  // current open state of the associated popup (only used w/ hasPopup)
  expanded?: boolean
}

// reusable circular icon button w/ consistent sizing & disabled styles
const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(({
  label,
  title,
  onClick,
  disabled = false,
  children,
  hasPopup,
  expanded,
}, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={title}
    aria-haspopup={hasPopup}
    aria-expanded={hasPopup ? expanded : undefined}
    disabled={disabled}
    onClick={onClick}
    className="flex h-10 w-10 items-center justify-center rounded-[1.1rem] border border-white/12 bg-[#232323] text-slate-100 transition hover:border-white/22 hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:opacity-45"
  >
    {children}
  </button>
))

// * primary board action bar — rendered below the toolbar in App
export const BoardActionBar = ({
  exportStatus,
  onAddTier,
  onOpenSettings,
  onExport,
  onReset,
}: BoardActionBarProps) => {
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const exportButtonRef = useRef<HTMLButtonElement | null>(null)
  const exportMenuRef = useRef<HTMLDivElement | null>(null)

  usePopupClose({
    show: showExportMenu,
    triggerRef: exportButtonRef,
    popupRef: exportMenuRef,
    onClose: useCallback(() => setShowExportMenu(false), []),
  })

  return (
    <>
      <div className="mt-3 flex justify-center">
        <div className="inline-flex items-center gap-5 rounded-[1.7rem] border border-white/12 bg-[#272727] px-8 py-2">
          {/* add a new tier row to the bottom of the board */}
          <ActionButton
            label="Add tier"
            title="Add Tier"
            onClick={onAddTier}
          >
            <Plus className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* open the settings panel for image import & tier management */}
          <ActionButton
            label="Open settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>

          {/* export button w/ PNG/PDF dropdown menu */}
          <div className="relative">
            <ActionButton
              ref={exportButtonRef}
              label="Open export options"
              title="Export"
              onClick={() => {
                if (!showExportMenu) setShowExportMenu(true)
              }}
              disabled={exportStatus !== null}
              hasPopup="menu"
              expanded={showExportMenu}
            >
              <SquareArrowUp className="h-5 w-5" strokeWidth={1.8} />
            </ActionButton>

            {showExportMenu && (
              <div
                ref={exportMenuRef}
                role="menu"
                className="absolute left-1/2 top-full z-30 mt-3 w-40 -translate-x-1/2 rounded-2xl border border-white/12 bg-[#1e1e1e] p-1.5 shadow-2xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/6 disabled:opacity-45"
                  onClick={() => {
                    setShowExportMenu(false)
                    void onExport('png')
                  }}
                  disabled={exportStatus !== null}
                >
                  Export PNG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="mt-1 flex w-full rounded-xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/6 disabled:opacity-45"
                  onClick={() => {
                    setShowExportMenu(false)
                    void onExport('pdf')
                  }}
                  disabled={exportStatus !== null}
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>

          {/* reset — requires confirmation before wiping the board */}
          <ActionButton
            label="Reset board"
            title="Reset"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw className="h-5 w-5" strokeWidth={1.8} />
          </ActionButton>
        </div>
      </div>

      {/* confirmation dialog shown before the destructive reset action */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset board?"
        description="This restores the default tiers and the sample image pack."
        confirmText="Reset"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          onReset()
          setConfirmReset(false)
        }}
      />
    </>
  )
}
