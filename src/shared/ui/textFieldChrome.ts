// src/shared/ui/textFieldChrome.ts
// shared text input/textarea chrome classes

export type TextFieldVariant = 'surface' | 'ghost' | 'settings'
export type TextFieldSize = 'xs' | 'sm' | 'md' | 'settings'

export const TEXT_FIELD_SIZE_CLASS: Record<TextFieldSize, string> = {
  xs: 'px-2 py-1.5 text-xs',
  sm: 'px-2.5 py-1.5 text-sm',
  md: 'px-3 py-2 text-sm',
  settings: 'px-3 py-2 text-[13px]',
}

export const TEXT_INPUT_SIZE_CLASS: Record<TextFieldSize, string> = {
  ...TEXT_FIELD_SIZE_CLASS,
  settings: 'h-9 px-3 text-[13px]',
}

// corner radius travels w/ the variant so settings fields match the settings
// SelectField (rounded-lg) instead of drifting to the default md
export const TEXT_FIELD_RADIUS_CLASS: Record<TextFieldVariant, string> = {
  surface: 'rounded-md',
  ghost: 'rounded-md',
  settings: 'rounded-lg',
}

export const TEXT_FIELD_VARIANT_CLASS: Record<TextFieldVariant, string> = {
  surface:
    'border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] transition focus:border-[var(--t-border-hover)]',
  ghost:
    'bg-transparent text-[var(--t-text)] placeholder:text-[var(--t-text-faint)]',
  settings:
    'border border-[var(--t-border)] bg-[var(--t-bg-sunken)] text-[var(--t-text)] placeholder:text-[var(--t-text-faint)] transition hover:border-[var(--t-border-hover)] focus:border-[var(--t-border-hover)] focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]',
}
