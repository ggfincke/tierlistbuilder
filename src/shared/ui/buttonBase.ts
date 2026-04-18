// src/shared/ui/buttonBase.ts
// shared button chrome — keep focus-custom & disabled behavior consistent
// across PrimaryButton/SecondaryButton/ActionButton/ItemOverlayButton

export const BUTTON_FOCUS_CLASS = 'focus-custom'

// shared disabled chrome — used by every button variant that exposes a
// `disabled` prop. ItemOverlayButton opts out because overlay actions
// are either rendered or not, never in a disabled state
export const BUTTON_DISABLED_CLASS =
  'disabled:cursor-not-allowed disabled:opacity-50'
