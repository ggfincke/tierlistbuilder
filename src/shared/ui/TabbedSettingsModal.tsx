// src/shared/ui/TabbedSettingsModal.tsx
// shared tabbed modal chrome for settings-style panels

import { useId, type ReactNode } from 'react'

import { BaseModal } from '~/shared/overlay/BaseModal'
import { ModalHeader } from '~/shared/overlay/ModalHeader'
import { useRovingSelection } from '~/shared/selection/useRovingSelection'
import { SecondaryButton } from './SecondaryButton'

interface TabbedSettingsModalProps<TTab extends string>
{
  open: boolean
  title: string
  tabs: readonly TTab[]
  activeTab: TTab
  groupLabel: string
  onActiveTabChange: (tab: TTab) => void
  onClose: () => void
  children: ReactNode
}

export const TabbedSettingsModal = <TTab extends string>({
  open,
  title,
  tabs,
  activeTab,
  groupLabel,
  onActiveTabChange,
  onClose,
  children,
}: TabbedSettingsModalProps<TTab>) =>
{
  const titleId = useId()
  const tabsId = useId()
  const {
    getItemProps: getTabProps,
    groupProps: tabListProps,
    isActive,
  } = useRovingSelection({
    items: tabs,
    activeKey: activeTab,
    onSelect: onActiveTabChange,
    kind: 'tab',
    groupLabel,
  })

  return (
    <BaseModal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      panelClassName="flex h-[min(36rem,calc(100vh-4rem))] w-full max-w-2xl flex-col p-4"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <ModalHeader titleId={titleId}>{title}</ModalHeader>
          <div
            {...tabListProps}
            className="flex gap-1 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-0.5"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab}
                {...getTabProps(tab, index)}
                id={`${tabsId}-${tab}-tab`}
                aria-controls={`${tabsId}-${tab}-panel`}
                className={`focus-custom rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--t-accent)] max-sm:px-2 max-sm:py-2 ${
                  isActive(tab)
                    ? 'bg-[var(--t-bg-active)] text-[var(--t-text)] shadow-sm'
                    : 'text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <SecondaryButton size="sm" onClick={onClose}>
          Done
        </SecondaryButton>
      </div>

      <div
        id={`${tabsId}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${activeTab}-tab`}
        className="min-h-0 space-y-5 overflow-y-auto pr-1"
      >
        {children}
      </div>
    </BaseModal>
  )
}
