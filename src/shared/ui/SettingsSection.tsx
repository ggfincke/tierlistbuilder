// src/shared/ui/SettingsSection.tsx
// reusable settings section w/ styled border & heading

interface SettingsSectionProps
{
  title: string
  children: React.ReactNode
}

export const SettingsSection = ({ title, children }: SettingsSectionProps) => (
  <section className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3">
    <h3 className="mb-2 pb-2 border-b border-[var(--t-border)] text-sm font-semibold text-[var(--t-text)]">
      {title}
    </h3>
    {children}
  </section>
)
