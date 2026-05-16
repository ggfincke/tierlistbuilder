// src/features/library/components/LibrarySignedOutState.tsx
// slim "these boards are local-only" banner above the signed-out My Boards
// grid — boards still render; this surfaces the sign-in-to-sync path

import { CloudOff, LogIn } from 'lucide-react'

import { promptSignIn } from '~/features/platform/auth/model/useSignInPromptStore'
import { CHUNKY_SHADOW_ACCENT } from '~/shared/ui/chunkyShadow'

export const LibrarySignedOutState = () => (
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--t-border)] bg-[rgb(var(--t-overlay)/0.03)] px-4 py-3">
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--t-overlay)/0.06)] text-[var(--t-text-muted)]">
        <CloudOff className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
      <p className="text-[12px] text-[var(--t-text-secondary)]">
        These boards live on this device only.{' '}
        <span className="text-[var(--t-text-muted)]">
          Sign in to sync them across devices.
        </span>
      </p>
    </div>
    <button
      type="button"
      onClick={promptSignIn}
      className={`focus-custom inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--t-accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--t-accent-foreground)] transition ${CHUNKY_SHADOW_ACCENT} focus-visible:ring-2 focus-visible:ring-[var(--t-accent)]`}
    >
      <LogIn className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      Sign in to sync
    </button>
  </div>
)
