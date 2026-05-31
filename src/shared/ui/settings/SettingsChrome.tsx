// src/shared/ui/settings/SettingsChrome.tsx
// shared settings-page section, field, & control primitives

import { useId, type ComponentProps, type ReactNode } from 'react'

import { ChevronDown } from 'lucide-react'

import { joinClassNames } from '~/shared/lib/className'
import { TextArea } from '~/shared/ui/TextArea'
import { TextInput } from '~/shared/ui/TextInput'
import { Toggle } from '~/shared/ui/settings/Toggle'

interface SetSectionProps
{
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  dense?: boolean
  id?: string
  className?: string
}

export const SetSection = ({
  eyebrow,
  title,
  subtitle,
  children,
  dense = false,
  id,
  className,
}: SetSectionProps) => (
  <section
    id={id}
    className={joinClassNames(
      'flex flex-col gap-3.5 rounded-xl border border-[var(--t-border)] bg-[var(--t-bg-surface)]',
      dense ? 'p-4' : 'p-5',
      className
    )}
  >
    <header className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        {eyebrow !== undefined && eyebrow !== null && (
          <p className="mono text-[10px] uppercase tracking-[0.2em] text-[var(--t-text-faint)]">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-0.5 text-[14px] font-bold text-[var(--t-text)]">
          {title}
        </h2>
      </div>
      {subtitle !== undefined && subtitle !== null && (
        <p className="max-w-[360px] flex-1 text-right text-[11px] leading-relaxed text-[var(--t-text-muted)]">
          {subtitle}
        </p>
      )}
    </header>
    {children}
  </section>
)

interface SettingsTabLayoutProps
{
  main: ReactNode
  aside: ReactNode
}

export const SettingsTabLayout = ({ main, aside }: SettingsTabLayoutProps) => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div className="flex flex-col gap-4 lg:col-span-2">{main}</div>
    {aside}
  </div>
)

interface FieldProps
{
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}

const FIELD_LABEL_CLASS =
  'mono flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]'

export const Field = ({ label, htmlFor, hint, children }: FieldProps) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    {htmlFor !== undefined ? (
      <label htmlFor={htmlFor} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
    ) : (
      <span className={FIELD_LABEL_CLASS}>{label}</span>
    )}
    {children}
    {hint !== undefined && hint !== null && (
      <p className="text-[10px] leading-relaxed text-[var(--t-text-faint)]">
        {hint}
      </p>
    )}
  </div>
)

type TextFieldProps = Omit<
  ComponentProps<typeof TextInput>,
  'onChange' | 'size' | 'variant'
> & {
  onChange: (value: string) => void
  mono?: boolean
}

export const TextField = ({
  onChange,
  mono = false,
  className,
  ...props
}: TextFieldProps) => (
  <TextInput
    {...props}
    variant="settings"
    size="settings"
    onChange={(event) => onChange(event.target.value)}
    className={joinClassNames(mono && 'mono', className)}
  />
)

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextInput>,
  'onChange' | 'size' | 'type' | 'variant'
> & {
  onChange: (value: string) => void
}

export const PasswordField = ({ onChange, ...props }: PasswordFieldProps) => (
  <TextInput
    {...props}
    type="password"
    variant="settings"
    size="settings"
    onChange={(event) => onChange(event.target.value)}
  />
)

type TextAreaFieldProps = Omit<
  ComponentProps<typeof TextArea>,
  'onChange' | 'size' | 'variant'
> & {
  onChange: (value: string) => void
}

export const TextAreaField = ({
  onChange,
  className,
  ...props
}: TextAreaFieldProps) => (
  <TextArea
    {...props}
    variant="settings"
    size="settings"
    onChange={(event) => onChange(event.target.value)}
    className={joinClassNames('resize-y leading-relaxed', className)}
  />
)

interface SelectFieldProps
{
  id?: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
}

export const SelectField = ({
  id,
  value,
  onChange,
  options,
  disabled = false,
}: SelectFieldProps) => (
  <div className="relative">
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="focus-custom h-9 w-full appearance-none rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] pl-3 pr-8 text-[13px] text-[var(--t-text)] transition hover:border-[var(--t-border-hover)] focus-visible:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <ChevronDown
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--t-text-muted)]"
      strokeWidth={2}
    />
  </div>
)

interface ToggleRowProps
{
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: ToggleRowProps) =>
{
  const labelId = useId()
  const hintId = useId()
  const hasHint = hint !== undefined && hint !== null

  return (
    <div className="flex items-start gap-2.5 py-1 text-left">
      <Toggle
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        size="compact"
        ariaLabelledby={labelId}
        ariaDescribedby={hasHint ? hintId : undefined}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span
          id={labelId}
          className="block text-[12px] font-medium leading-tight text-[var(--t-text)]"
        >
          {label}
        </span>
        {hasHint && (
          <span
            id={hintId}
            className="mt-0.5 block text-[10px] leading-snug text-[var(--t-text-faint)]"
          >
            {hint}
          </span>
        )}
      </span>
    </div>
  )
}

export const SettingLabel = ({ children }: { children: ReactNode }) => (
  <p className="mono mb-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]">
    {children}
  </p>
)
