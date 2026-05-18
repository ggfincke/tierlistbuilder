// src/shared/ui/NumberStepper.tsx
// compact numeric input w/ flush +/- buttons in a single connected control

import { useCallback, useState } from 'react'

import { clamp } from '~/shared/lib/math'

interface NumberStepperProps
{
  id?: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  inputLabel: string
  decreaseLabel: string
  increaseLabel: string
  decreaseTitle: string
  increaseTitle: string
  active?: boolean
  parseValue?: (value: string) => number | null
  onChange: (value: number) => void
}

export const NumberStepper = ({
  id,
  value,
  min,
  max,
  step,
  suffix,
  inputLabel,
  decreaseLabel,
  increaseLabel,
  decreaseTitle,
  increaseTitle,
  active = false,
  parseValue,
  onChange,
}: NumberStepperProps) =>
{
  const [draft, setDraft] = useState<string | null>(null)
  const visible = draft ?? String(value)

  const commitDraft = useCallback(() =>
  {
    if (draft === null) return
    const parsed = parseValue ? parseValue(draft) : Number(draft)
    if (parsed === null || !Number.isFinite(parsed))
    {
      setDraft(null)
      return
    }
    const next = clamp(Math.round(parsed), min, max)
    setDraft(null)
    if (next !== value) onChange(next)
  }, [draft, max, min, parseValue, value, onChange])

  const nudge = useCallback(
    (delta: number) =>
    {
      const next = clamp(value + delta, min, max)
      setDraft(null)
      if (next !== value) onChange(next)
    },
    [max, min, value, onChange]
  )

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-md border bg-[var(--t-bg-surface)] transition focus-within:border-[var(--t-border-hover)] focus-within:ring-2 focus-within:ring-[var(--t-accent)] ${
        active
          ? 'border-[var(--t-border-hover)]'
          : 'border-[var(--t-border-secondary)]'
      }`}
    >
      <button
        type="button"
        onClick={() => nudge(-step)}
        disabled={value <= min}
        aria-label={decreaseLabel}
        title={decreaseTitle}
        className="focus-custom flex w-7 items-center justify-center text-base text-[var(--t-text-muted)] enabled:hover:bg-[var(--t-bg-active)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        −
      </button>
      <span
        aria-hidden="true"
        className="w-px bg-[var(--t-border-secondary)]"
      />
      <label className="flex h-7 items-center px-1 text-[var(--t-text-muted)]">
        <input
          id={id}
          type="text"
          value={visible}
          inputMode="numeric"
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) =>
          {
            setDraft(String(value))
            e.currentTarget.select()
          }}
          onBlur={commitDraft}
          onKeyDown={(e) =>
          {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape')
            {
              setDraft(null)
              e.currentTarget.blur()
            }
          }}
          className={`bg-transparent text-center tabular-nums text-[var(--t-text)] outline-none [appearance:textfield] ${
            suffix ? 'w-9 text-right' : 'w-10'
          }`}
          aria-label={inputLabel}
          spellCheck={false}
        />
        {suffix && (
          <span aria-hidden="true" className="pl-0.5 text-[0.65rem]">
            {suffix}
          </span>
        )}
      </label>
      <span
        aria-hidden="true"
        className="w-px bg-[var(--t-border-secondary)]"
      />
      <button
        type="button"
        onClick={() => nudge(step)}
        disabled={value >= max}
        aria-label={increaseLabel}
        title={increaseTitle}
        className="focus-custom flex w-7 items-center justify-center text-base text-[var(--t-text-muted)] enabled:hover:bg-[var(--t-bg-active)] enabled:hover:text-[var(--t-text)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]"
      >
        +
      </button>
    </div>
  )
}
