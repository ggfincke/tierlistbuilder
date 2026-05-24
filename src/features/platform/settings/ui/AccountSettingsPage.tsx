// src/features/platform/settings/ui/AccountSettingsPage.tsx
// full-page account settings — the design's dense Settings screen. backend-backed
// sections are wired live; no-backend ones stay as commented TODO(backend) scaffolds.

import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import type {
  PublicUserMe,
  UserPlan,
} from '@tierlistbuilder/contracts/platform/user'
import { useAuthSession } from '~/features/platform/auth/model/useAuthSession'
import { getUserInitial } from '~/features/platform/auth/model/userIdentity'
import { useSignInPromptStore } from '~/features/platform/auth/model/useSignInPromptStore'
import { AccountDangerZone } from '~/features/platform/auth/ui/AccountDangerZone'
import { AccountSessionsSection } from '~/features/platform/auth/ui/AccountSessionsSection'
import { ShortcutsList } from '~/features/workspace/shortcuts/ui/ShortcutsList'
import { getWorkspacePath } from '~/shared/routes/pathname'
import { DisplayHeadline } from '~/shared/ui/DisplayHeadline'
import { PrimaryButton } from '~/shared/ui/PrimaryButton'
import { AppearanceSection } from './AppearanceSection'
import { IdentitySection } from './IdentitySection'
import { Field, SetSection } from './SettingsChrome'

const PAGE_CLASS =
  'relative z-10 mx-auto w-full max-w-[1320px] px-6 pb-24 pt-20 sm:px-10 sm:pt-24'

const PlanBadge = ({ plan }: { plan: UserPlan }) =>
  plan === 'plus' ? (
    <span className="rounded bg-[var(--t-accent-2)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#0a0a0a]">
      Plus
    </span>
  ) : (
    <span className="rounded border border-[var(--t-border)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t-text-muted)]">
      Free
    </span>
  )

const ReadonlyValue = ({ children }: { children: ReactNode }) => (
  <p className="truncate rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] px-3 py-2 text-[13px] text-[var(--t-text-secondary)]">
    {children}
  </p>
)

const SettingsHero = ({ user }: { user: PublicUserMe }) => (
  <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--t-border)] pb-4">
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
        to={getWorkspacePath()}
        className="text-[10px] uppercase tracking-[0.16em] text-[var(--t-text-muted)] hover:underline"
      >
        ← Back to app
      </Link>
      {/*
        TODO(backend): Stripe checkout. `plan` is a real users column
        ('free' | 'plus') but there is no billing integration, so the design's
        "Subscribe" CTA is omitted:
          <PrimaryButton>Subscribe</PrimaryButton>
      */}
    </div>
  </header>
)

const AccountSection = ({ user }: { user: PublicUserMe }) => (
  <SetSection id="account" eyebrow="Sign in" title="Account">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Email">
        <ReadonlyValue>{user.email ?? 'No email on file'}</ReadonlyValue>
      </Field>
      <Field label="Sign-in method">
        <ReadonlyValue>Email &amp; password</ReadonlyValue>
      </Field>
    </div>
    {/*
      TODO(backend): password change + 2FA + recovery codes. Auth is email &
      password via @convex-dev/auth w/ no self-serve password reset, 2FA, or
      recovery-code mutations. Wire those, then restore the design's actions:
        <SecondaryButton>Update password</SecondaryButton>
        <SecondaryButton>Set up 2FA</SecondaryButton>
    */}
  </SetSection>
)

const SessionsSection = ({ onSignedOut }: { onSignedOut: () => void }) => (
  <SetSection
    eyebrow="Security"
    title="Active sessions"
    subtitle="Sign out anywhere you don't recognize."
    className="flex-1"
  >
    {/*
      TODO(backend): per-device session list. signOutEverywhere exists (below),
      but there is no query enumerating individual authSessions (device,
      location, last-seen) nor per-session revoke. Wire those, then restore the
      device grid w/ a "this device" badge + per-row Sign out.
    */}
    <div className="mt-auto">
      <AccountSessionsSection onClose={onSignedOut} />
    </div>
  </SetSection>
)

const AvatarSection = ({ user }: { user: PublicUserMe }) => (
  <SetSection eyebrow="Image" title="Avatar">
    <div className="flex items-center gap-3">
      {user.image ? (
        <img
          src={user.image}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-[22px] font-black text-[var(--t-accent-foreground)]"
          style={{
            background:
              'linear-gradient(135deg, var(--t-accent), var(--t-accent-2))',
          }}
        >
          {getUserInitial(user, 'U')}
        </span>
      )}
      <p className="text-[11px] leading-relaxed text-[var(--t-text-muted)]">
        Your avatar is generated from your initials.
      </p>
    </div>
    {/*
      TODO(backend): avatar upload. schema has users.avatarStorageId but there
      is no upload mutation (generateUploadUrl + setAvatar), remove action, or
      generated-swatch picker. Wire those, then restore the design's controls:
        <SecondaryButton>Upload</SecondaryButton> + Remove link
        <div className="grid grid-cols-6 ...">{generated swatches}</div>
    */}
  </SetSection>
)

const PlanSection = ({ plan }: { plan: UserPlan }) => (
  <SetSection eyebrow="Billing" title="Plan & billing">
    <div className="flex items-center justify-between rounded-lg border border-[var(--t-border)] bg-[var(--t-bg-sunken)] p-3">
      <div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--t-text-faint)]">
          Current plan
        </p>
        <p className="text-[18px] font-black leading-tight text-[var(--t-text)]">
          {plan === 'plus' ? 'Plus' : 'Free'}
        </p>
      </div>
    </div>
    {/*
      TODO(backend): Stripe billing. `plan` is real, but there is no billing
      integration — price, renewal date, card on file, invoices, &
      Manage/Subscribe are mocked. Wire Stripe, then restore the design's
      billing card + payment-method row + Manage/Invoices actions.
    */}
  </SetSection>
)

const ShortcutsSection = () => (
  <SetSection
    eyebrow="Reference"
    title="Keyboard shortcuts"
    subtitle="Most apply while editing a board."
  >
    <ShortcutsList />
  </SetSection>
)

const DataSection = ({ onSignedOut }: { onSignedOut: () => void }) => (
  <SetSection
    id="data"
    eyebrow="Portability"
    title="Export, import & lifecycle"
    subtitle="Download your data or permanently delete your account."
  >
    {/*
      TODO(backend): account-level export (JSON/CSV/PNG) + import + deactivate.
      Per-board export exists in the workspace, but there is no account-wide
      bulk export, no importer, & no reversible "deactivate" (only the hard
      deleteAccount below). Wire those, then restore the export tiles + import
      dropzone + Deactivate button from the design.
    */}
    <div className="border-t border-[var(--t-border)] pt-3">
      <p className="text-[12px] font-bold text-[var(--t-destructive)]">
        Delete account permanently
      </p>
      <p className="mb-2 mt-0.5 text-[10px] text-[var(--t-text-muted)]">
        Removes all boards, takes, and data. Cannot be undone.
      </p>
      <AccountDangerZone onClose={onSignedOut} />
    </div>
  </SetSection>
)

const SettingsShell = ({ children }: { children: ReactNode }) => (
  <section className={PAGE_CLASS}>{children}</section>
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
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <DisplayHeadline size="page" accent="Settings" />
      <p className="max-w-sm text-[14px] text-[var(--t-text-muted)]">
        Sign in to view and edit your account settings.
      </p>
      <PrimaryButton size="md" onClick={onSignIn}>
        Sign in
      </PrimaryButton>
    </div>
  </SettingsShell>
)

export const AccountSettingsPage = () =>
{
  const session = useAuthSession()
  const navigate = useNavigate()
  const showSignIn = useSignInPromptStore((state) => state.show)

  if (session.status === 'loading')
  {
    return <SettingsLoading />
  }
  if (session.status === 'signed-out')
  {
    return <SettingsSignedOut onSignIn={showSignIn} />
  }

  const user = session.user
  // sessions/danger actions sign the caller out; return them to the workspace
  const handleSignedOut = () => navigate(getWorkspacePath())

  return (
    <SettingsShell>
      <SettingsHero user={user} />

      <div className="mt-6 flex flex-col gap-4">
        {/* Block A — Identity/Account/Sessions on the left, Avatar/Plan right */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <IdentitySection user={user} />
            <AccountSection user={user} />
            <SessionsSection onSignedOut={handleSignedOut} />
          </div>
          <div className="flex flex-col gap-4">
            <AvatarSection user={user} />
            <PlanSection plan={user.plan} />
            <ShortcutsSection />
            {/*
              TODO(backend): Linked accounts (Google / Apple / Discord OAuth).
              Auth is email & password only — no OAuth providers or authAccounts
              linking UI. Wire OAuth, then restore the linked-accounts card w/
              per-row Link/Unlink.
            */}
          </div>
        </div>

        <AppearanceSection />

        {/*
          TODO(backend): Connections (Discord / Bluesky / Letterboxd / X /
          Mastodon / Steam). No third-party integration backend exists. Wire
          integrations, then restore the 3x2 services grid w/ Link/Unlink.
        */}

        {/* Published templates & rankings (author management) are moving out of
            Settings into a planned "Published" view in My Boards — see
            AccountTemplatesSection / AccountRankingsSection, awaiting re-homing. */}

        {/*
          TODO(backend): Privacy (default board visibility, who-can-reply,
          members directory, AI-training opt-out, follower approval, hide from
          search). No privacy/visibility or social-graph backend exists. Wire
          those, then restore the Privacy card (two Segmented controls + toggle
          stack).
        */}

        <DataSection onSignedOut={handleSignedOut} />
      </div>
    </SettingsShell>
  )
}
