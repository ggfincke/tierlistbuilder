// src/components/settings/SettingRow.tsx
// reusable setting row w/ label on left, control on right

interface SettingRowProps
{
  label: string
  children: React.ReactNode
}

export const SettingRow = ({ label, children }: SettingRowProps) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <span className="text-sm text-[var(--t-text-secondary)]">{label}</span>
    {children}
  </div>
)
