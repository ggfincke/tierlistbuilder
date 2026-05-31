// src/features/marketplace/ui/publish/PublishFormFields.tsx
// shared publish-modal field, counter, & submit footer primitives

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { DialogActions } from '~/shared/overlay/DialogActions'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'
import { TextInput } from '~/shared/ui/TextInput'

interface CharacterCounterProps
{
  count: number
  max: number
  tooLong: boolean
}

const CharacterCounter = ({ count, max, tooLong }: CharacterCounterProps) => (
  <span className={tooLong ? 'text-[var(--t-destructive-hover)]' : ''}>
    {count}/{max}
  </span>
)

interface FieldCounterRowProps extends CharacterCounterProps
{
  hint?: ReactNode
}

const FieldCounterRow = ({
  hint,
  count,
  max,
  tooLong,
}: FieldCounterRowProps) => (
  <div
    className={`mt-1 flex text-[10px] text-[var(--t-text-faint)] ${
      hint ? 'items-center justify-between' : 'justify-end'
    }`}
  >
    {hint && <span>{hint}</span>}
    <CharacterCounter count={count} max={max} tooLong={tooLong} />
  </div>
)

interface LabeledTextFieldProps extends FieldCounterRowProps
{
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  placeholder: string
  disabled: boolean
  required?: boolean
}

export const LabeledTextField = ({
  id,
  label,
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  required,
  hint,
  count,
  max,
  tooLong,
}: LabeledTextFieldProps) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium text-[var(--t-text-secondary)]"
    >
      {label}
    </label>
    <TextInput
      id={id}
      size="md"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      placeholder={placeholder}
      className="mt-1 w-full"
      disabled={disabled}
      required={required}
    />
    <FieldCounterRow hint={hint} count={count} max={max} tooLong={tooLong} />
  </div>
)

interface LabeledTextAreaProps extends FieldCounterRowProps
{
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  maxLength: number
  rows: number
  placeholder: string
  disabled: boolean
}

export const LabeledTextArea = ({
  id,
  label,
  value,
  onChange,
  maxLength,
  rows,
  placeholder,
  disabled,
  hint,
  count,
  max,
  tooLong,
}: LabeledTextAreaProps) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium text-[var(--t-text-secondary)]"
    >
      {label}
    </label>
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] focus:border-[var(--t-border-hover)]"
    />
    <FieldCounterRow hint={hint} count={count} max={max} tooLong={tooLong} />
  </div>
)

export interface LabeledSelectOption<TValue extends string>
{
  value: TValue
  label: string
}

interface LabeledSelectProps<TValue extends string>
{
  id: string
  label: string
  value: TValue
  onChange: (value: TValue) => void
  options: readonly LabeledSelectOption<TValue>[]
  disabled: boolean
}

export const LabeledSelect = <TValue extends string>({
  id,
  label,
  value,
  onChange,
  options,
  disabled,
}: LabeledSelectProps<TValue>) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-medium text-[var(--t-text-secondary)]"
    >
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) =>
      {
        const selected = options.find(
          (option) => option.value === event.target.value
        )
        if (selected) onChange(selected.value)
      }}
      disabled={disabled}
      className="focus-custom mt-1 w-full rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] px-3 py-2 text-sm text-[var(--t-text)] focus:border-[var(--t-border-hover)]"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
)

interface PublishSubmitFooterProps
{
  isPending: boolean
  canSubmit: boolean
  onCancel: () => void
  pendingLabel: string
  submitLabel: string
  className: string
}

export const PublishSubmitFooter = ({
  isPending,
  canSubmit,
  onCancel,
  pendingLabel,
  submitLabel,
  className,
}: PublishSubmitFooterProps) => (
  <DialogActions className={className}>
    <SecondaryButton type="button" disabled={isPending} onClick={onCancel}>
      Cancel
    </SecondaryButton>
    <PrimaryButton type="submit" size="md" disabled={!canSubmit}>
      {isPending ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          {pendingLabel}
        </>
      ) : (
        submitLabel
      )}
    </PrimaryButton>
  </DialogActions>
)
