// src/components/ui/ToastContainer.tsx
// fixed-position toast stack — renders auto-dismissing notification toasts

import { X } from 'lucide-react'

import { useToastStore, type Toast } from '../../store/useToastStore'
import { useSettingsStore } from '../../store/useSettingsStore'

const TYPE_CLASSES: Record<Toast['type'], string> = {
  info: 'border-[rgb(var(--t-overlay)/0.18)] bg-[var(--t-bg-overlay)]',
  success:
    'border-[color-mix(in_srgb,#4ade80_40%,transparent)] bg-[color-mix(in_srgb,#4ade80_10%,var(--t-bg-overlay))]',
  error:
    'border-[color-mix(in_srgb,var(--t-destructive)_50%,transparent)] bg-[color-mix(in_srgb,var(--t-destructive)_10%,var(--t-bg-overlay))]',
}

export const ToastContainer = () =>
{
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      style={{ bottom: `max(1rem, env(safe-area-inset-bottom, 0px))` }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg ${TYPE_CLASSES[t.type]} ${reducedMotion ? '' : 'animate-[fadeIn_120ms_ease-out]'}`}
        >
          <span className="text-sm text-[var(--t-text)]">{t.message}</span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="rounded p-0.5 text-[var(--t-text-faint)] transition-colors hover:text-[var(--t-text)]"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
