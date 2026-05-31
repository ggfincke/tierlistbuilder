// src/features/platform/auth/ui/AccountSessionsSection.tsx
// active account sessions list + sign-out actions

import { useState } from 'react'
import { Laptop, LogOut } from 'lucide-react'

import type { Id } from '@convex/_generated/dataModel'
import type { PublicUserSession } from '@tierlistbuilder/contracts/platform/user'
import {
  useAccountSessionsQuery,
  useRevokeSessionMutation,
  useSignOutEverywhereMutation,
} from '~/features/platform/auth/model/useAccountMutations'
import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { formatError } from '~/shared/lib/errors'
import { useAsyncAction } from '~/shared/hooks/useAsyncAction'
import { toast } from '~/shared/notifications/useToastStore'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

interface AccountSessionsSectionProps
{
  onClose: () => void
}

const formatSessionTime = (timestamp: number): string =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))

const SessionRow = ({
  session,
  disabled,
  pending,
  onRevoke,
}: {
  session: PublicUserSession
  disabled: boolean
  pending: boolean
  onRevoke: (session: PublicUserSession) => void
}) => (
  <li className="flex items-start justify-between gap-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2">
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-[var(--t-border-secondary)] bg-[var(--t-bg-surface)] text-[var(--t-text-muted)]">
        <Laptop className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[12px] font-bold text-[var(--t-text)]">
          Browser session
          {session.isCurrent && (
            <span className="rounded bg-[var(--t-accent)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-[var(--t-accent-foreground)]">
              Current
            </span>
          )}
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--t-text-faint)]">
          Created {formatSessionTime(session.createdAt)} · expires{' '}
          {formatSessionTime(session.expiresAt)}
        </p>
      </div>
    </div>
    <SecondaryButton
      type="button"
      size="sm"
      tone={session.isCurrent ? 'destructive' : 'default'}
      disabled={disabled || pending}
      onClick={() => onRevoke(session)}
    >
      <LogOut className="h-3 w-3" />
      {pending ? 'Signing out...' : 'Sign out'}
    </SecondaryButton>
  </li>
)

export const AccountSessionsSection = ({
  onClose,
}: AccountSessionsSectionProps) =>
{
  const sessions = useAccountSessionsQuery()
  const revokeSession = useRevokeSessionMutation()
  const signOutEverywhere = useSignOutEverywhereMutation()
  const { signOut } = useAuthActions()
  const { pending, run } = useAsyncAction()
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)

  const handleRevoke = async (session: PublicUserSession) =>
  {
    if (pending || pendingSessionId) return
    setPendingSessionId(session._id)
    try
    {
      const result = await revokeSession(session._id as Id<'authSessions'>)
      if (result.revokedCurrent)
      {
        // signing out can still fail; toast success only once it has, so we
        // never show a 'signed out' toast alongside the catch's error toast
        await signOut()
        toast('Signed out from this device', 'success')
        onClose()
        return
      }
      toast('Session revoked', 'success')
    }
    catch (error)
    {
      toast(formatError(error, 'Failed to sign out session'), 'error')
    }
    finally
    {
      setPendingSessionId(null)
    }
  }

  const handleClick = async () =>
  {
    await run({
      action: async () =>
      {
        await signOutEverywhere()
        await signOut()
      },
      successMessage: 'Signed out from every device',
      errorMessage: 'Failed to sign out everywhere',
      onSuccess: onClose,
      resetPending: 'error',
    })
  }

  return (
    <div className="space-y-2">
      {sessions === undefined ? (
        <div className="space-y-2">
          <div className="h-11 animate-pulse rounded-lg bg-[var(--t-bg-sunken)]" />
          <div className="h-11 animate-pulse rounded-lg bg-[var(--t-bg-sunken)]" />
        </div>
      ) : sessions.length > 0 ? (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <SessionRow
              key={session._id}
              session={session}
              disabled={pending || pendingSessionId !== null}
              pending={pendingSessionId === session._id}
              onRevoke={handleRevoke}
            />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--t-text-muted)]">
          No active sessions found.
        </p>
      )}
      <SecondaryButton
        tone="destructive"
        disabled={pending || pendingSessionId !== null}
        onClick={handleClick}
      >
        <LogOut className="h-3.5 w-3.5" />
        {pending ? 'Signing out...' : 'Sign out everywhere'}
      </SecondaryButton>
    </div>
  )
}
