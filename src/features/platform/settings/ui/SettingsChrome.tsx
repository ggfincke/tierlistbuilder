// src/features/platform/settings/ui/SettingsChrome.tsx
// editorial chrome primitives for the account settings page — surface cards,
// labelled fields, & form controls styled to the Scoreboard design language

import type { ReactNode } from 'react'

import { joinClassNames } from '~/shared/lib/className'

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

// rounded surface card w/ a mono eyebrow, bold title, & optional right-aligned
// subtitle — the repeated container for every settings section
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

interface FieldProps
{
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  children: ReactNode
}

const FIELD_LABEL_CLASS =
  'mono flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-faint)]'

// mono-labelled vertical field group w/ optional hint copy beneath the control.
// renders a <label> when wired to a control id, else a plain <span> so
// read-only display fields don't trip label-has-associated-control
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

const CONTROL_CLASS =
  'focus-custom w-full rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] text-[13px] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] disabled:cursor-not-allowed disabled:opacity-60'

interface TextFieldProps
{
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  mono?: boolean
  disabled?: boolean
  autoComplete?: string
  spellCheck?: boolean
  'aria-label'?: string
}

export const TextField = ({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  mono = false,
  disabled = false,
  autoComplete,
  spellCheck,
  'aria-label': ariaLabel,
}: TextFieldProps) => (
  <input
    id={id}
    type="text"
    value={value}
    placeholder={placeholder}
    maxLength={maxLength}
    disabled={disabled}
    autoComplete={autoComplete}
    spellCheck={spellCheck}
    aria-label={ariaLabel}
    onChange={(event) => onChange(event.target.value)}
    className={joinClassNames(CONTROL_CLASS, 'h-9 px-3', mono && 'mono')}
  />
)

interface PasswordFieldProps
{
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  disabled?: boolean
}

export const PasswordField = ({
  id,
  name,
  value,
  onChange,
  autoComplete,
  disabled = false,
}: PasswordFieldProps) => (
  <input
    id={id}
    name={name}
    type="password"
    value={value}
    disabled={disabled}
    autoComplete={autoComplete}
    onChange={(event) => onChange(event.target.value)}
    className={joinClassNames(CONTROL_CLASS, 'h-9 px-3')}
  />
)

interface TextAreaFieldProps
{
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
  disabled?: boolean
}

export const TextAreaField = ({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  disabled = false,
}: TextAreaFieldProps) => (
  <textarea
    id={id}
    value={value}
    placeholder={placeholder}
    maxLength={maxLength}
    rows={rows}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value)}
    className={joinClassNames(
      CONTROL_CLASS,
      'resize-y px-3 py-2 leading-relaxed'
    )}
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
      className={joinClassNames(CONTROL_CLASS, 'h-9 appearance-none pl-3 pr-8')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--t-text-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </div>
)

interface ToggleRowProps
{
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChange: (value: boolean) => void
}

// compact label-left / switch-left stacked toggle matching the design's dense
// switches (smaller than the shared settings Toggle used inside modals)
export const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
}: ToggleRowProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex items-start gap-2.5 py-1 text-left"
  >
    <span
      className={joinClassNames(
        'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors',
        checked
          ? 'border-[var(--t-accent)] bg-[var(--t-accent)]'
          : 'border-[var(--t-border)] bg-[var(--t-bg-sunken)]'
      )}
    >
      <span
        className={joinClassNames(
          'absolute top-[1px] h-3 w-3 rounded-full transition-transform',
          checked
            ? 'translate-x-[15px] bg-[var(--t-accent-foreground)]'
            : 'translate-x-[2px] bg-[var(--t-text-muted)]'
        )}
      />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[12px] font-medium leading-tight text-[var(--t-text)]">
        {label}
      </span>
      {hint !== undefined && hint !== null && (
        <span className="mt-0.5 block text-[10px] leading-snug text-[var(--t-text-faint)]">
          {hint}
        </span>
      )}
    </span>
  </button>
)
