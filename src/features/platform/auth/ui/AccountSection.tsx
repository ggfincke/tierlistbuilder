// src/features/platform/auth/ui/AccountSection.tsx
// settings tab block — sign-in trigger when signed out, profile card + sign-out
// when signed in. lifted into its own slice so community views can reuse it

import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'

import { useAuthActions } from '~/features/platform/auth/model/useAuthActions'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { SignInModal } from '~/features/platform/auth/ui/SignInModal'
import { SettingsSection } from '~/features/workspace/settings/ui/SettingsSection'
import { SecondaryButton } from '~/shared/ui/SecondaryButton'

export const AccountSection = () =>
{
  const session = useAuthSession()
  const { signOut } = useAuthActions()
  const [showSignIn, setShowSignIn] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // sign-out swaps the session state, which in turn usually unmounts the
  // account section (the signed-in branch disappears). guard the state
  // update so we never call setSigningOut on an unmounted component
  const isMountedRef = useRef(true)
  useEffect(
    () => () =>
    {
      isMountedRef.current = false
    },
    []
  )

  const handleSignOut = async () =>
  {
    setSigningOut(true)
    try
    {
      await signOut()
    }
    finally
    {
      if (isMountedRef.current)
      {
        setSigningOut(false)
      }
    }
  }

  return (
    <SettingsSection title="Account">
      {session.status === 'loading' && (
        <p className="py-1.5 text-sm text-[var(--t-text-faint)]">
          Loading account…
        </p>
      )}

      {session.status === 'signed-out' && (
        <>
          <p className="text-sm text-[var(--t-text-secondary)]">
            Sign in to sync your boards across devices & publish templates.
          </p>
          <SecondaryButton
            variant="surface"
            className="mt-2"
            onClick={() => setShowSignIn(true)}
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign in
          </SecondaryButton>
        </>
      )}

      {session.status === 'signed-in' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                className="h-8 w-8 flex-shrink-0 rounded-full border border-[var(--t-border)] object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-8 w-8 flex-shrink-0 rounded-full border border-[var(--t-border)] bg-[var(--t-bg-active)]"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[var(--t-text)]">
                {session.user.displayName ??
                  session.user.name ??
                  session.user.email ??
                  'Signed in'}
              </p>
              {session.user.email &&
                session.user.email !==
                  (session.user.displayName ?? session.user.name) && (
                  <p className="truncate text-xs text-[var(--t-text-faint)]">
                    {session.user.email}
                  </p>
                )}
            </div>
          </div>
          <SecondaryButton
            variant="surface"
            tone="destructive"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </SecondaryButton>
        </div>
      )}

      <SignInModal open={showSignIn} onClose={() => setShowSignIn(false)} />
    </SettingsSection>
  )
}
