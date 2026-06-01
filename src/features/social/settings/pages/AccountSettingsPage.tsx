// src/features/social/settings/pages/AccountSettingsPage.tsx
// full-page account settings route entry

import type { ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import type { PublicUserMe } from '@tierlistbuilder/contracts/platform/user'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { useProfileDraft } from '~/features/platform/auth/model/useProfileDraft'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { settingsTabPath } from '~/shared/routes/settings'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { SignedOutPrompt } from '~/shared/ui/PageState'
import { PAGE_TOP_LEVEL } from '~/shared/ui/pageContainer'
import { AccountPanel } from '../ui/AccountPanel'
import { AppearancePanel } from '../ui/AppearancePanel'
import { DataPanel } from '../ui/DataPanel'
import { PrivacyPanel } from '../ui/PrivacyPanel'
import { ProfilePanel } from '../ui/ProfilePanel'
import { PlanBadge } from '../ui/PlanBadge'
import { SettingsTabs } from '../ui/SettingsTabs'

const PROFILE_PATH = settingsTabPath('profile')

const SettingsHero = ({ user }: { user: PublicUserMe }) => (
  <header className="flex flex-wrap items-end justify-between gap-6">
    <DisplayHeadline
      size="page"
      accent="Settings"
      eyebrow={
        <span className="flex flex-wrap items-center gap-2">
          <span>Signed in as</span>
          {user.handle && (
            <>
              <span aria-hidden>·</span>
              <span>@{user.handle}</span>
            </>
          )}
          {user.email && (
            <>
              <span aria-hidden>·</span>
              <span>{user.email}</span>
            </>
          )}
        </span>
      }
    />
    <div className="flex items-center gap-3 pb-1">
      <PlanBadge plan={user.plan} />
      <Link
        to="/"
        className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-muted)] hover:underline"
      >
        ← Back to app
      </Link>
    </div>
  </header>
)

const SettingsShell = ({ children }: { children: ReactNode }) => (
  <section className={PAGE_TOP_LEVEL}>{children}</section>
)

const SettingsLoading = () => (
  <SettingsShell>
    <div className="h-9 w-40 animate-pulse rounded bg-[var(--t-bg-surface)]" />
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="h-72 animate-pulse rounded-xl bg-[var(--t-bg-surface)] lg:col-span-2" />
      <div className="h-72 animate-pulse rounded-xl bg-[var(--t-bg-surface)]" />
    </div>
  </SettingsShell>
)

const SettingsSignedOut = ({ onSignIn }: { onSignIn: () => void }) => (
  <SettingsShell>
    <SignedOutPrompt
      title={<DisplayHeadline size="page" accent="Settings" />}
      body="Sign in to view and edit your account settings."
      onSignIn={onSignIn}
    />
  </SettingsShell>
)

const SignedInSettings = ({ user }: { user: PublicUserMe }) =>
{
  const navigate = useNavigate()
  // Page-level draft lets the Identity editor & live preview share state.
  // Edits survive tab switches because the draft lives above sub-routes.
  const profile = useProfileDraft(user)
  // Sessions/danger actions sign the caller out; return them to workspace.
  const handleSignedOut = () => navigate('/')

  return (
    <SettingsShell>
      <SettingsHero user={user} />
      <div className="mt-6">
        <SettingsTabs profileDirty={profile.dirty} />
      </div>
      <div className="mt-6">
        <Routes>
          <Route index element={<Navigate to={PROFILE_PATH} replace />} />
          <Route
            path="profile"
            element={<ProfilePanel user={user} profile={profile} />}
          />
          <Route
            path="account"
            element={<AccountPanel user={user} onSignedOut={handleSignedOut} />}
          />
          <Route path="appearance" element={<AppearancePanel />} />
          <Route path="privacy" element={<PrivacyPanel user={user} />} />
          <Route
            path="data"
            element={<DataPanel onSignedOut={handleSignedOut} />}
          />
          <Route path="*" element={<Navigate to={PROFILE_PATH} replace />} />
        </Routes>
      </div>
    </SettingsShell>
  )
}

export const AccountSettingsPage = () =>
{
  const session = useAuthSession()
  const showSignIn = useSignInPromptStore((state) => state.show)

  if (session.status === 'loading')
  {
    return <SettingsLoading />
  }
  if (session.status === 'signed-out')
  {
    return <SettingsSignedOut onSignIn={showSignIn} />
  }

  return <SignedInSettings user={session.user} />
}
